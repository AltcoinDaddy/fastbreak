# Design Document

## Overview

This design addresses the TypeScript compilation errors in the FastBreak database package that prevent services from accessing database repositories. The solution involves fixing type mismatches in the emergency-stop repository, correcting strategy parameter definitions in seed data, and ensuring consistent type definitions across the database layer.

## Architecture

The database layer follows a repository pattern with:
- `DatabaseManager` as the main entry point providing access to all repositories
- Individual repository classes extending `BaseRepository` for each entity type
- Type-safe interfaces for all database entities
- Migration and seeding utilities for database setup

## Components and Interfaces

### Fixed Emergency Stop Repository

The emergency stop repository update method needs to properly handle the update parameter types:

```typescript
// Current problematic code
return this.update(id, updates, client);

// Fixed approach
return this.update(id, this.toSnakeCaseObject(updates), client);
```

### Strategy Parameters Interface

The strategy parameters need to include all required properties for each strategy type:

```typescript
interface RookieRisersParams {
  performanceThreshold: number;
  priceLimit: number;
  minGamesPlayed: number;
  maxYearsExperience: number;
  targetPositions: string[];
  minMinutesPerGame: number;
  efficiencyRatingMin: number;
  // Additional required properties
}
```

### Type Consistency

All repository interfaces should use consistent naming and typing:
- Database column names in snake_case
- Entity properties in camelCase
- Proper type mapping between database and application layers

## Data Models

### Emergency Stop Entity
```typescript
interface EmergencyStop {
  id: string;
  userId: string;
  triggeredBy: string;
  reason: string;
  triggerConditions: string[];
  isActive: boolean;
  triggeredAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  impact: EmergencyStopImpact;
}
```

### Strategy Parameters
```typescript
interface StrategyParameters {
  rookieRisers?: RookieRisersParams;
  postGameSpikes?: PostGameSpikesParams;
  arbitrageMode?: ArbitrageModeParams;
}
```

## Error Handling

### Compilation Error Resolution
1. Fix type mismatches in emergency-stop repository update method
2. Complete strategy parameter definitions in seed data
3. Ensure all repository methods use proper type conversions
4. Validate that all imported types are properly exported

### Runtime Error Prevention
1. Add proper null checks in repository methods
2. Ensure database column mappings are correct
3. Validate entity data before database operations
4. Handle missing optional properties gracefully

## Testing Strategy

### Unit Tests
- Test each repository method with correct type parameters
- Verify entity mapping functions work correctly
- Test database connection and transaction handling

### Integration Tests
- Test DatabaseManager initialization with all repositories
- Verify services can access repository methods
- Test end-to-end database operations

### Type Safety Tests
- Ensure TypeScript compilation succeeds
- Verify no type assertion workarounds are needed
- Test that all repository interfaces are properly typed