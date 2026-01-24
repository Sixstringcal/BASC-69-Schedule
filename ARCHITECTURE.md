# Architecture Overview

## MVVM Pattern Implementation

The backend follows the MVVM (Model-View-ViewModel) architecture pattern, adapted for REST APIs:

### Models (Data Layer)
Located in `backend/models/`

**User.js**
- Handles OAuth token storage and retrieval
- Methods: `findByWcaUserId()`, `createOrUpdate()`

**GroupSelection.js**
- Manages group selection data
- Methods: `findByRegistrantId()`, `findByActivity()`, `countByActivityAndGroup()`, `createOrUpdate()`, `getAllWithCompetitors()`

### Services (Business Logic Layer)
Located in `backend/services/`

**AuthService.js**
- OAuth authentication flow
- User session management
- Delegate verification
- Methods: `handleOAuthCallback()`, `getCurrentUser()`, `verifyDelegate()`

**GroupService.js**
- Group selection logic
- Capacity validation
- WCIF integration for competitor verification
- Methods: `getAvailableGroups()`, `selectGroup()`, `getActivityGroups()`

**AdminService.js**
- Delegate operations
- WCIF write functionality
- Write history tracking
- Methods: `getPendingGroups()`, `writeToWCIF()`, `getWriteHistory()`

### Controllers (HTTP Layer)
Located in `backend/routes/`

**auth.js**
- Handles authentication endpoints
- Routes: `/auth/wca`, `/auth/wca/callback`, `/auth/me`, `/auth/logout`
- Delegates to `AuthService`

**groups.js**
- Handles group selection endpoints
- Routes: `GET /api/groups`, `POST /api/groups/select`, `GET /api/groups/:activityId`
- Delegates to `GroupService`

**admin.js**
- Handles delegate operations
- Routes: `GET /api/admin/check`, `GET /api/admin/pending-groups`, `POST /api/admin/write-wcif`, `GET /api/admin/write-history`
- Delegates to `AdminService` and `AuthService`

## Request Flow

1. Client makes HTTP request
2. Express routes it to appropriate controller (routes/*.js)
3. Middleware verifies authentication/authorization
4. Controller validates request and calls Service
5. Service contains business logic and calls Model
6. Model executes database operations
7. Results bubble back up through Service to Controller
8. Controller formats response and sends to client

## Data Flow Example

**Selecting a Group:**
```
Client → POST /api/groups/select
   ↓
routes/groups.js (Controller)
   ↓
GroupService.selectGroup() (Business Logic)
   ↓
- Validates WCIF registration
- Checks capacity limits
   ↓
GroupSelection.createOrUpdate() (Model)
   ↓
Database INSERT/UPDATE
   ↓
Response back to client
```

## Benefits of This Structure

- **Separation of Concerns**: Each layer has a clear responsibility
- **Testability**: Services and models can be unit tested independently
- **Maintainability**: Business logic is centralized in services, not scattered across routes
- **Reusability**: Services can be called from multiple controllers
- **Scalability**: Easy to add new features without touching existing code

## Utilities
Located in `backend/utils/`

**wcif.js**
- WCIF data fetching with caching
- Activity parsing helpers
- Not part of MVVM layers, used by services as needed

## Middleware
Located in `backend/middleware/`

**auth.js**
- Authentication and authorization checks
- Uses `AuthService` for delegate verification
