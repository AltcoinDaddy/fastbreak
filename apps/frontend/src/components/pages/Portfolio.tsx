'use client';

import React from 'react';

const Portfolio = () => {
  const portfolioValue = 12345.67;
  const portfolioChange = 1.23;

  const holdings = [
    {
      id: '1',
      player: 'LeBron James',
      team: 'Lakers',
      series: 'Series 3',
      value: 2500,
      change: 2.5,
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA7TwDo5oOFyKbAZW6NxkslxlPRruYWRrZ5pKl0R1Z_wXxNxSpAAJJG0gx_cle369_IiRas7AQroYFKQSSxHhsBoLLxsWAZcpEujMEhoKDzAsbUEwPB8bygWUAvvzN0bre0ijZ4zOGQzqAN5sqzx_f32-MaUN6VVSSEoppJ8x2x1YEak8excno_0GIxrgbFCsfiDq1ReqtvqxMYyfYI3f2T4X_w8mymTW2TnoGbM4SgYTb7wiJAF5nFVka-H-ly6ayn_iyqMPjSdXQ',
    },
    {
      id: '2',
      player: 'Stephen Curry',
      team: 'Warriors',
      series: 'Series 3',
      value: 2200,
      change: -1.8,
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBVztufkobCAegb4YNYaErpfUkouedyeQFcvobDveHemxcrHx1LHXNlbu8J8Mc0y0yDim9QYDNpUb30Rw5v7De7hP-ac2nAnevFVJv1GRy8GpWFrpbYtX4IRAYqZ_JiLsVARTZ2T0L6zvui_98VNHeag83JMrWfGlWCztdanm403T1ZUkA21B4uPO8gDOjUeXVoJtYNVj148fCbAwg6TafrFvEoxgLr6mX229GnaRkDCSMo-fHf6hVwCfZhzsJXfY7NKVJybFV0PW4',
    },
    {
      id: '3',
      player: 'Kevin Durant',
      team: 'Nets',
      series: 'Series 3',
      value: 2000,
      change: 0.5,
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDnnVNneXBj7XgncaDqIIUzO9YIRiNCnJjkf4xyTkcTwb63oN8MzhRHCE-RCSY7_SQVbTUWUs7GTWkSgaKG2lbNLtLNIz22IXi5fborbQpXLiBDLJ5OQTBK6BUCU4AZt_1m_CFU2jodarjgjs5lE1L3tVDdTreD5RRBJCJPl4HW3iQWyuHRcczjDuAepMRc0pNulhUwjrwQ0pKK9Wp8IWpLD9JLYyvwKXJ6EweZQ0oyk76CG0T9RosmpTURV4XWiFbVDMVlb38U6IU',
    },
    {
      id: '4',
      player: 'Giannis Antetokounmpo',
      team: 'Bucks',
      series: 'Series 3',
      value: 1800,
      change: 3.2,
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAfUf8sGddxLkEznftafUB5Q600-JTx6NV6pqsvY1lMGUdoZ0BeodsgEqSf7RTJXjtpKpI0spylgV7KbreWu2C0p18ER1IliDfkkjzlczRMgsDByJknOru85PrxLVjicN3hds0FrwNuVwh8mU0wFjgEV3hjj00YJwkwg12XE0Rr3sCoflhvz7JRtAIrTH1CGsybPrIpZvU0kZX8ja7PFdT5OYdqm7ZaqMc2CALlPl0sDqHshVRKnYeFZ4Z_m_bHuA56nXVkz_lH-PA',
    },
    {
      id: '5',
      player: 'Luka Dončić',
      team: 'Mavericks',
      series: 'Series 3',
      value: 1500,
      change: -0.7,
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZcejn4DKfn-2I93DS_ipIsgWVO_fpBAmP172yAoqM6vpODlBzBCUL09V2wd-f5QwK4p7tVMs-imxKpVMyvE8rB_QNyoio-CFpqNMHAsDFuV8LDiDoxd1u7Rug51SVRvnqdZIO4wUk921ncFsBR1_KRD0soYBMwi-E10UZUAznA-AMTUVLW6qFgw_wud-xam-1FVu3nrwoPHQDuiCxMQ3q-cVOMNnYS-akpuMJAl1kW3OpCpGFDCaIsTQ83B9b8_G0-gRqaVs58eU',
    },
  ];

  const aiReasoningItems = [
    {
      id: '1',
      analyst: 'AI Analyst',
      time: '2h ago',
      message: "LeBron James's moment value increased due to his exceptional performance in the last game.",
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB3iyD3aalAVLPh0Ko4OjSOF0oRuOGZ7nYNFEl9fGNyqvOUxY0TcDgkkqpVYSUq9Z0hknFuLB6i2VRWDf4DTuH0JO88ydXvtT02YmdM8MfiCtXpW44_lY7xsslqjZmLaEQIF0QGR19MpeLwEVTL1nQ2LfcB9zh0WhxwRs6taFKlcLtJoLepfRHmjIFsoRlmgCsk-7OI6c9NIfma92wVSAcE0UQDVIkKlqaZhN0BD-s9aGGmbMofcWY5-le5_KSiZod4kyIchF4N1Gg',
    },
    {
      id: '2',
      analyst: 'AI Analyst',
      time: '4h ago',
      message: "Stephen Curry's moment value decreased slightly due to a minor injury concern.",
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAZSTyAcvpvdGZHQ613kprBuZKeNehNXFXgXA1mIg406xuQJXHyZIEEW6kWJQbfEj6faVdEwqavCneU8OIF8cvz969_rL8K9bpsjvhKzHtmMFLB7BhfRVVev30NQQkqSl1Z-VkoyrAbRsKZ2e5KblcbxP0H4NQtF78j3-DujBRwy_RqRc1M5K5EJt7eGiOhjENHwPueNPqBY-u5aEkeSZBwgZxzGvsB_hRfx6q5vciVEvxOH4GQ7b08Sk7tD8rCi-ufIx06s42ohAM',
    },
    {
      id: '3',
      analyst: 'AI Analyst',
      time: '6h ago',
      message: "Kevin Durant's moment value remains stable with a slight increase based on consistent performance.",
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDxMs0XP2fo5f-aCYtbaFYVqTnheVYspWsrV-R8pWL6eH4hmiLL7QLBoxJtwtJyLcN_PcBb322uQydEbGvFUeJlUVfKkQosOqqSHUK7SrVx8fyTmpWqLP9w2Mevy8nJ6yCpOZm9vsQnimzUYQSbGOKAoncVqJ98KKG0Ze5T1dHStBGGF8Z1299sYKaLPGXblJC8ssrNnDFuMkVD188zzAgO1mo4IDisigUn9ZY_ZanDFENh_6NCW4ddrxGt2jcTyW4mA84TM8aYEcw',
    },
  ];

  const recentTrades = [
    {
      id: '1',
      type: 'buy',
      description: 'Bought LeBron James moment for $2,450',
      time: '1h ago',
    },
    {
      id: '2',
      type: 'sell',
      description: 'Sold Stephen Curry moment for $2,250',
      time: '3h ago',
    },
  ];

  const activeStrategies = [
    {
      name: 'Performance-Based Buying',
      description: 'Buys undervalued moments based on player performance',
      active: true,
    },
    {
      name: 'Profit-Taking',
      description: 'Sells moments that have reached their target price',
      active: true,
    },
    {
      name: 'Rising Star Investments',
      description: 'Buys moments of rising stars before they become expensive',
      active: true,
    },
  ];

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col bg-[#111522]" style={{ fontFamily: 'Inter, "Noto Sans", sans-serif' }}>
      <div className="layout-container flex h-full grow flex-col">
        {/* Header */}
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-b-[#242d47] px-10 py-3">
          <div className="flex items-center gap-4 text-white">
            <div className="size-4">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12.0799 24L4 19.2479L9.95537 8.75216L18.04 13.4961L18.0446 4H29.9554L29.96 13.4961L38.0446 8.75216L44 19.2479L35.92 24L44 28.7521L38.0446 39.2479L29.96 34.5039L29.9554 44H18.0446L18.04 34.5039L9.95537 39.2479L4 28.7521L12.0799 24Z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <h2 className="text-white text-lg font-bold leading-tight tracking-[-0.015em]">FastBreak</h2>
          </div>
          <div className="flex flex-1 justify-end gap-8">
            <div className="flex items-center gap-9">
              <a className="text-white text-sm font-medium leading-normal" href="#">Dashboard</a>
              <a className="text-white text-sm font-medium leading-normal" href="#">Strategies</a>
              <a className="text-white text-sm font-medium leading-normal" href="#">Portfolio</a>
              <a className="text-white text-sm font-medium leading-normal" href="#">Activity</a>
            </div>
            <button className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 bg-[#242d47] text-white gap-2 text-sm font-bold leading-normal tracking-[0.015em] min-w-0 px-2.5">
              <div className="text-white" data-icon="Bell" data-size="20px" data-weight="regular">
                <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216ZM48,184c7.7-13.24,16-43.92,16-80a64,64,0,1,1,128,0c0,36.05,8.28,66.73,16,80Z" />
                </svg>
              </div>
            </button>
            <div
              className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10"
              style={{
                backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBZWsjUTlFyORE_Jl_DzY_sZrQVJM205WLDARloWlRqiJdr9hTX36fao2zrx5ZiB_WgZcM1Y6CG0diNg-4nAgjiXT8NjgvANfbHOCBdOt6s0kpnv7Sz78SPH6toEFiNfFK5WYGPk0DBsggLekAJHULnOTBU6Bg-DKNZLyGvjobXyBt7CjaAiNz1DCGRPZzl8GDS4N0rqJek2xxIiUaJxcYFIY0QQ9BCCiQ35Qut4KMUP9KEWXNadkwBbwYRWT9rWRx6hsKJ7Zd2p4s")'
              }}
            />
          </div>
        </header>

        <div className="gap-1 px-6 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col max-w-[920px] flex-1">
            {/* Page Header */}
            <div className="flex flex-wrap justify-between gap-3 p-4">
              <div className="flex min-w-72 flex-col gap-3">
                <p className="text-white tracking-light text-[32px] font-bold leading-tight">Portfolio</p>
                <p className="text-[#93a0c8] text-sm font-normal leading-normal">Track your holdings and performance</p>
              </div>
            </div>

            {/* Portfolio Value Section */}
            <div className="p-4">
              <div className="flex items-stretch justify-between gap-4 rounded-lg">
                <div className="flex flex-[2_2_0px] flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-white text-base font-bold leading-tight">Total Portfolio Value</p>
                    <p className="text-[#93a0c8] text-sm font-normal leading-normal">${portfolioValue.toLocaleString()}</p>
                  </div>
                  <button className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-8 px-4 flex-row-reverse bg-[#242d47] text-white pr-2 gap-1 text-sm font-medium leading-normal w-fit">
                    <div className="text-white" data-icon="ArrowUp" data-size="18px" data-weight="regular">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18px" height="18px" fill="currentColor" viewBox="0 0 256 256">
                        <path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z" />
                      </svg>
                    </div>
                    <span className="truncate">+{portfolioChange}%</span>
                  </button>
                </div>
                <div
                  className="w-full bg-center bg-no-repeat aspect-video bg-cover rounded-lg flex-1"
                  style={{
                    backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuA6yZsyb8F03Xu7GmIAYn9c6HWSibjxYk1D8exXltdY9YLTjy5fHk-qfjp9KyRaVHFWhOMYovY2DFnZ5TD0M2y47-SQT3U63WVji_NLkqSHz48fP8B09xXOukOchsk_fRVXc1MZp_LSVfjK8K2OALphmcYHVH7GnskIRvccKY26vkxbw5sM_00OKBVMy9EBNZop1VrrcuMysG7fxec93MRW3FMmPzZJHQgfXUNuoQr9yHF8klinMvkSdXZWt9mWvWVHlUy-0yT2aK4")'
                  }}
                />
              </div>
            </div>

            {/* Holdings Section */}
            <h2 className="text-white text-[22px] font-bold leading-tight tracking-[-0.015em] px-4 pb-3 pt-5">Holdings</h2>
            <div className="px-4 py-3 @container">
              <div className="flex overflow-hidden rounded-lg border border-[#344065] bg-[#111522]">
                <table className="flex-1">
                  <thead>
                    <tr className="bg-[#1a2032]">
                      <th className="px-4 py-3 text-left text-white w-14 text-sm font-medium leading-normal">Moment</th>
                      <th className="px-4 py-3 text-left text-white w-[400px] text-sm font-medium leading-normal">Player</th>
                      <th className="px-4 py-3 text-left text-white w-[400px] text-sm font-medium leading-normal">Team</th>
                      <th className="px-4 py-3 text-left text-white w-[400px] text-sm font-medium leading-normal">Series</th>
                      <th className="px-4 py-3 text-left text-white w-[400px] text-sm font-medium leading-normal">Value</th>
                      <th className="px-4 py-3 text-left text-white w-[400px] text-sm font-medium leading-normal">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((holding) => (
                      <tr key={holding.id} className="border-t border-t-[#344065]">
                        <td className="h-[72px] px-4 py-2 w-14 text-sm font-normal leading-normal">
                          <div
                            className="bg-center bg-no-repeat aspect-square bg-cover rounded-full w-10"
                            style={{ backgroundImage: `url("${holding.image}")` }}
                          />
                        </td>
                        <td className="h-[72px] px-4 py-2 w-[400px] text-white text-sm font-normal leading-normal">{holding.player}</td>
                        <td className="h-[72px] px-4 py-2 w-[400px] text-[#93a0c8] text-sm font-normal leading-normal">{holding.team}</td>
                        <td className="h-[72px] px-4 py-2 w-[400px] text-[#93a0c8] text-sm font-normal leading-normal">{holding.series}</td>
                        <td className="h-[72px] px-4 py-2 w-[400px] text-[#93a0c8] text-sm font-normal leading-normal">${holding.value.toLocaleString()}</td>
                        <td className="h-[72px] px-4 py-2 w-[400px] text-[#93a0c8] text-sm font-normal leading-normal">
                          {holding.change >= 0 ? '+' : ''}{holding.change}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Active Strategies Section */}
            <h2 className="text-white text-[22px] font-bold leading-tight tracking-[-0.015em] px-4 pb-3 pt-5">Active Strategies</h2>
            {activeStrategies.map((strategy, index) => (
              <div key={index} className="flex items-center gap-4 bg-[#111522] px-4 min-h-[72px] py-2 justify-between">
                <div className="flex flex-col justify-center">
                  <p className="text-white text-base font-medium leading-normal line-clamp-1">{strategy.name}</p>
                  <p className="text-[#93a0c8] text-sm font-normal leading-normal line-clamp-2">{strategy.description}</p>
                </div>
                <div className="shrink-0">
                  <label className="relative flex h-[31px] w-[51px] cursor-pointer items-center rounded-full border-none bg-[#242d47] p-0.5 has-[:checked]:justify-end has-[:checked]:bg-[#0a1e5c]">
                    <div className="h-full w-[27px] rounded-full bg-white" style={{ boxShadow: 'rgba(0, 0, 0, 0.15) 0px 3px 8px, rgba(0, 0, 0, 0.06) 0px 3px 1px' }} />
                    <input type="checkbox" className="invisible absolute" defaultChecked={strategy.active} />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* Right Sidebar */}
          <div className="layout-content-container flex flex-col w-[360px]">
            {/* AI Reasoning Section */}
            <h2 className="text-white text-[22px] font-bold leading-tight tracking-[-0.015em] px-4 pb-3 pt-5">AI Reasoning</h2>
            {aiReasoningItems.map((item) => (
              <div key={item.id} className="flex w-full flex-row items-start justify-start gap-3 p-4">
                <div
                  className="bg-center bg-no-repeat aspect-square bg-cover rounded-full w-10 shrink-0"
                  style={{ backgroundImage: `url("${item.avatar}")` }}
                />
                <div className="flex h-full flex-1 flex-col items-start justify-start">
                  <div className="flex w-full flex-row items-start justify-start gap-x-3">
                    <p className="text-white text-sm font-bold leading-normal tracking-[0.015em]">{item.analyst}</p>
                    <p className="text-[#93a0c8] text-sm font-normal leading-normal">{item.time}</p>
                  </div>
                  <p className="text-white text-sm font-normal leading-normal">{item.message}</p>
                </div>
              </div>
            ))}

            {/* Recent Trades Section */}
            <h2 className="text-white text-[22px] font-bold leading-tight tracking-[-0.015em] px-4 pb-3 pt-5">Recent Trades</h2>
            {recentTrades.map((trade) => (
              <div key={trade.id} className="flex items-center gap-4 bg-[#111522] px-4 min-h-[72px] py-2 justify-between">
                <div className="flex flex-col justify-center">
                  <p className="text-white text-base font-medium leading-normal line-clamp-1">Trade Executed</p>
                  <p className="text-[#93a0c8] text-sm font-normal leading-normal line-clamp-2">{trade.description}</p>
                </div>
                <div className="shrink-0">
                  <p className="text-[#93a0c8] text-sm font-normal leading-normal">{trade.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Portfolio;