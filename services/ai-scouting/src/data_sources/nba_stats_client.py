import httpx
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime, date, timedelta
import pandas as pd
from cachetools import TTLCache
from tenacity import retry, stop_after_attempt, wait_exponential
import logging
from ..models.player_stats import GameStats, SeasonStats, PlayerProfile

logger = logging.getLogger(__name__)

class NBAStatsClient:
    """Client for fetching NBA statistics from various sources"""
    
    def __init__(self, api_key: Optional[str] = None, cache_ttl: int = 300):
        self.api_key = api_key
        self.base_url = "https://stats.nba.com/stats"
        self.cache = TTLCache(maxsize=1000, ttl=cache_ttl)
        self.session = None
        
        # Common headers to mimic browser requests
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': 'https://www.nba.com/',
            'x-nba-stats-origin': 'stats',
            'x-nba-stats-token': 'true'
        }
        
    async def __aenter__(self):
        self.session = httpx.AsyncClient(
            headers=self.headers,
            timeout=30.0,
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10)
        )
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.aclose()
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _make_request(self, endpoint: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Make HTTP request with retry logic and caching"""
        cache_key = f"{endpoint}:{str(sorted(params.items()))}"
        
        if cache_key in self.cache:
            logger.debug(f"Cache hit for {endpoint}")
            return self.cache[cache_key]
        
        if not self.session:
            raise RuntimeError("Client not initialized. Use async context manager.")
        
        try:
            response = await self.session.get(
                f"{self.base_url}/{endpoint}",
                params=params
            )
            response.raise_for_status()
            
            data = response.json()
            self.cache[cache_key] = data
            
            logger.debug(f"API request successful: {endpoint}")
            return data
            
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error for {endpoint}: {e.response.status_code}")
            raise
        except Exception as e:
            logger.error(f"Request failed for {endpoint}: {str(e)}")
            raise
    
    async def get_player_info(self, player_id: str) -> Optional[PlayerProfile]:
        """Get basic player information"""
        try:
            params = {
                'PlayerID': player_id,
                'LeagueID': '00'
            }
            
            data = await self._make_request('commonplayerinfo', params)
            
            if not data.get('resultSets') or not data['resultSets'][0].get('rowSet'):
                return None
            
            player_data = data['resultSets'][0]['rowSet'][0]
            headers = data['resultSets'][0]['headers']
            
            # Map data to PlayerProfile
            player_dict = dict(zip(headers, player_data))
            
            return PlayerProfile(
                player_id=str(player_dict.get('PERSON_ID', player_id)),
                name=player_dict.get('DISPLAY_FIRST_LAST', ''),
                position=player_dict.get('POSITION', 'PG'),
                height=player_dict.get('HEIGHT', ''),
                weight=int(player_dict.get('WEIGHT', 0) or 0),
                birth_date=datetime.strptime(player_dict.get('BIRTHDATE', '1990-01-01'), '%Y-%m-%dT%H:%M:%S').date(),
                years_pro=int(player_dict.get('FROM_YEAR', 0) or 0),
                college=player_dict.get('SCHOOL'),
                current_team=player_dict.get('TEAM_NAME', ''),
                jersey_number=int(player_dict.get('JERSEY', 0) or 0)
            )
            
        except Exception as e:
            logger.error(f"Error fetching player info for {player_id}: {str(e)}")
            return None
    
    async def get_player_season_stats(self, player_id: str, season: str = "2023-24") -> Optional[SeasonStats]:
        """Get player season statistics"""
        try:
            params = {
                'PlayerID': player_id,
                'Season': season,
                'SeasonType': 'Regular Season',
                'LeagueID': '00'
            }
            
            data = await self._make_request('playerdashboardbyyearoveryear', params)
            
            if not data.get('resultSets') or not data['resultSets'][1].get('rowSet'):
                return None
            
            stats_data = data['resultSets'][1]['rowSet'][0]
            headers = data['resultSets'][1]['headers']
            
            stats_dict = dict(zip(headers, stats_data))
            
            return SeasonStats(
                player_id=player_id,
                season=season,
                team=stats_dict.get('TEAM_ABBREVIATION', ''),
                position='PG',  # Would need separate call for position
                games_played=int(stats_dict.get('GP', 0) or 0),
                games_started=int(stats_dict.get('GS', 0) or 0),
                minutes_per_game=float(stats_dict.get('MIN', 0) or 0),
                points_per_game=float(stats_dict.get('PTS', 0) or 0),
                rebounds_per_game=float(stats_dict.get('REB', 0) or 0),
                assists_per_game=float(stats_dict.get('AST', 0) or 0),
                steals_per_game=float(stats_dict.get('STL', 0) or 0),
                blocks_per_game=float(stats_dict.get('BLK', 0) or 0),
                turnovers_per_game=float(stats_dict.get('TOV', 0) or 0),
                field_goal_percentage=float(stats_dict.get('FG_PCT', 0) or 0),
                three_point_percentage=float(stats_dict.get('FG3_PCT', 0) or 0),
                free_throw_percentage=float(stats_dict.get('FT_PCT', 0) or 0),
                player_efficiency_rating=float(stats_dict.get('PER', 0) or 0),
                true_shooting_percentage=float(stats_dict.get('TS_PCT', 0) or 0),
                usage_rate=float(stats_dict.get('USG_PCT', 0) or 0)
            )
            
        except Exception as e:
            logger.error(f"Error fetching season stats for {player_id}: {str(e)}")
            return None
    
    async def get_player_game_log(self, player_id: str, season: str = "2023-24", last_n_games: int = 10) -> List[GameStats]:
        """Get recent game statistics for a player"""
        try:
            params = {
                'PlayerID': player_id,
                'Season': season,
                'SeasonType': 'Regular Season',
                'LeagueID': '00'
            }
            
            data = await self._make_request('playergamelog', params)
            
            if not data.get('resultSets') or not data['resultSets'][0].get('rowSet'):
                return []
            
            games_data = data['resultSets'][0]['rowSet'][:last_n_games]
            headers = data['resultSets'][0]['headers']
            
            game_stats = []
            for game_data in games_data:
                game_dict = dict(zip(headers, game_data))
                
                game_stat = GameStats(
                    game_id=str(game_dict.get('Game_ID', '')),
                    player_id=player_id,
                    game_date=datetime.strptime(game_dict.get('GAME_DATE', '2024-01-01'), '%b %d, %Y').date(),
                    opponent=game_dict.get('MATCHUP', '').split()[-1] if game_dict.get('MATCHUP') else '',
                    minutes_played=float(game_dict.get('MIN', 0) or 0),
                    points=int(game_dict.get('PTS', 0) or 0),
                    rebounds=int(game_dict.get('REB', 0) or 0),
                    assists=int(game_dict.get('AST', 0) or 0),
                    steals=int(game_dict.get('STL', 0) or 0),
                    blocks=int(game_dict.get('BLK', 0) or 0),
                    turnovers=int(game_dict.get('TOV', 0) or 0),
                    field_goals_made=int(game_dict.get('FGM', 0) or 0),
                    field_goals_attempted=int(game_dict.get('FGA', 0) or 0),
                    three_pointers_made=int(game_dict.get('FG3M', 0) or 0),
                    three_pointers_attempted=int(game_dict.get('FG3A', 0) or 0),
                    free_throws_made=int(game_dict.get('FTM', 0) or 0),
                    free_throws_attempted=int(game_dict.get('FTA', 0) or 0),
                    personal_fouls=int(game_dict.get('PF', 0) or 0),
                    plus_minus=int(game_dict.get('PLUS_MINUS', 0) or 0)
                )
                game_stats.append(game_stat)
            
            return game_stats
            
        except Exception as e:
            logger.error(f"Error fetching game log for {player_id}: {str(e)}")
            return []
    
    async def get_team_roster(self, team_id: str, season: str = "2023-24") -> List[Dict[str, Any]]:
        """Get team roster information"""
        try:
            params = {
                'TeamID': team_id,
                'Season': season,
                'LeagueID': '00'
            }
            
            data = await self._make_request('commonteamroster', params)
            
            if not data.get('resultSets') or not data['resultSets'][0].get('rowSet'):
                return []
            
            roster_data = data['resultSets'][0]['rowSet']
            headers = data['resultSets'][0]['headers']
            
            return [dict(zip(headers, player_data)) for player_data in roster_data]
            
        except Exception as e:
            logger.error(f"Error fetching team roster for {team_id}: {str(e)}")
            return []
    
    async def get_league_leaders(self, stat_category: str = "PTS", season: str = "2023-24", limit: int = 50) -> List[Dict[str, Any]]:
        """Get league leaders for a specific statistic"""
        try:
            params = {
                'LeagueID': '00',
                'Season': season,
                'SeasonType': 'Regular Season',
                'StatCategory': stat_category,
                'Scope': 'S',
                'PlayerOrTeam': 'Player',
                'PlayerScope': 'All Players'
            }
            
            data = await self._make_request('leagueleaders', params)
            
            if not data.get('resultSets') or not data['resultSets'][0].get('rowSet'):
                return []
            
            leaders_data = data['resultSets'][0]['rowSet'][:limit]
            headers = data['resultSets'][0]['headers']
            
            return [dict(zip(headers, leader_data)) for leader_data in leaders_data]
            
        except Exception as e:
            logger.error(f"Error fetching league leaders for {stat_category}: {str(e)}")
            return []
    
    async def search_players(self, query: str) -> List[Dict[str, Any]]:
        """Search for players by name"""
        try:
            params = {
                'LeagueID': '00',
                'Season': '2023-24',
                'IsOnlyCurrentSeason': '1'
            }
            
            data = await self._make_request('commonallplayers', params)
            
            if not data.get('resultSets') or not data['resultSets'][0].get('rowSet'):
                return []
            
            players_data = data['resultSets'][0]['rowSet']
            headers = data['resultSets'][0]['headers']
            
            # Filter players by query
            matching_players = []
            query_lower = query.lower()
            
            for player_data in players_data:
                player_dict = dict(zip(headers, player_data))
                player_name = player_dict.get('DISPLAY_FIRST_LAST', '').lower()
                
                if query_lower in player_name:
                    matching_players.append(player_dict)
            
            return matching_players[:20]  # Limit results
            
        except Exception as e:
            logger.error(f"Error searching players with query '{query}': {str(e)}")
            return []
    
    async def get_player_advanced_stats(self, player_id: str, season: str = "2023-24") -> Dict[str, Any]:
        """Get advanced statistics for a player"""
        try:
            params = {
                'PlayerID': player_id,
                'Season': season,
                'SeasonType': 'Regular Season',
                'LeagueID': '00'
            }
            
            data = await self._make_request('playerprofilev2', params)
            
            # Extract various advanced stats from different result sets
            advanced_stats = {}
            
            if data.get('resultSets'):
                for result_set in data['resultSets']:
                    if result_set.get('name') == 'SeasonTotalsRegularSeason' and result_set.get('rowSet'):
                        headers = result_set['headers']
                        stats_data = result_set['rowSet'][0]
                        advanced_stats.update(dict(zip(headers, stats_data)))
            
            return advanced_stats
            
        except Exception as e:
            logger.error(f"Error fetching advanced stats for {player_id}: {str(e)}")
            return {}
    
    async def get_upcoming_games(self, team_id: Optional[str] = None, days_ahead: int = 7) -> List[Dict[str, Any]]:
        """Get upcoming games for a team or league"""
        try:
            end_date = datetime.now() + timedelta(days=days_ahead)
            
            params = {
                'LeagueID': '00',
                'Season': '2023-24',
                'SeasonType': 'Regular Season',
                'DateFrom': datetime.now().strftime('%m/%d/%Y'),
                'DateTo': end_date.strftime('%m/%d/%Y')
            }
            
            if team_id:
                params['TeamID'] = team_id
            
            data = await self._make_request('leaguegamefinder', params)
            
            if not data.get('resultSets') or not data['resultSets'][0].get('rowSet'):
                return []
            
            games_data = data['resultSets'][0]['rowSet']
            headers = data['resultSets'][0]['headers']
            
            return [dict(zip(headers, game_data)) for game_data in games_data]
            
        except Exception as e:
            logger.error(f"Error fetching upcoming games: {str(e)}")
            return []