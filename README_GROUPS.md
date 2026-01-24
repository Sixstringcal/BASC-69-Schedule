# BASC 69 2026 Schedule & Group Selection

A beautiful, responsive website for displaying the Bay Area Speedcubin' 69 2026 WCA competition schedule with integrated group selection functionality.

## Features

- 📅 **Interactive Schedule**: View competition schedule across multiple days and rooms
- 👥 **Group Selection**: Competitors can select their competing groups
- 🔐 **WCA OAuth**: Secure login with WCA accounts
- 👨‍💼 **Admin Panel**: Delegates can manage and write group selections to WCIF
- 🎨 **Responsive Design**: Works on desktop, tablet, and mobile
- ⚡ **Real-time Updates**: Group capacity tracking and validation

## Project Structure

```
BASC69 Schedule/
├── frontend/
│   ├── index.html          # Main HTML file
│   ├── script.js           # Schedule display logic
│   ├── groups.js           # Group selection logic
│   ├── styles.css          # All styles
│   ├── custom-info.json    # Custom event information
│   └── groups-config.json  # Group configuration
├── backend/
│   ├── server.js           # Express server
│   ├── package.json        # Dependencies
│   ├── schema.sql          # Database schema
│   ├── config/
│   │   └── passport.js     # OAuth configuration
│   ├── routes/
│   │   ├── auth.js         # Authentication routes
│   │   ├── groups.js       # Group selection routes
│   │   └── admin.js        # Admin routes
│   ├── middleware/
│   │   └── auth.js         # Auth middleware
│   └── utils/
│       └── wcif.js         # WCIF helper functions
└── README.md
```

## Prerequisites

- Node.js (v16 or higher)
- MySQL (v8 or higher)
- WCA OAuth Application credentials

## Setup Instructions

### 1. Create WCA OAuth Application

1. Go to https://www.worldcubeassociation.org/oauth/applications
2. Click "New Application"
3. Fill in:
   - **Name**: BASC 69 Group Selection
   - **Redirect URI**: `http://localhost:3000/auth/wca/callback` (for development)
   - **Scopes**: Select `public` and `email`
4. Save and note your **Client ID** and **Client Secret**

### 2. Database Setup

1. Install MySQL if you haven't already
2. Create the database and tables:

```bash
mysql -u root -p < backend/schema.sql
```

Or manually:

```sql
CREATE DATABASE basc69_groups;
```

Then run the SQL in `backend/schema.sql`.

### 3. Backend Configuration

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (copy from `.env.example`):
```bash
cp ../.env.example .env
```

4. Edit `.env` with your values:
```env
WCA_CLIENT_ID=your_wca_client_id
WCA_CLIENT_SECRET=your_wca_client_secret
WCA_CALLBACK_URL=http://localhost:3000/auth/wca/callback
WCA_ORIGIN=https://www.worldcubeassociation.org

SESSION_SECRET=generate_a_random_string_here
DATABASE_URL=mysql://username:password@localhost:3306/basc69_groups

COMPETITION_ID=BayAreaSpeedcubin692026
PORT=3000
NODE_ENV=development

FRONTEND_URL=http://localhost:8000
```

5. Generate a secure session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Configure Groups

Edit `groups-config.json` to specify which events/rounds should have group selection:

```json
{
  "groupSettings": {
    "3x3x3 Cube, Round 1": {
      "numGroups": 4,
      "maxPerGroup": 24
    },
    "9x9x9 Cube": {
      "numGroups": 1,
      "maxPerGroup": 24
    }
  }
}
```

Use the exact activity names as they appear in the WCIF schedule.

### 5. Run the Application

#### Development Mode

Terminal 1 - Backend:
```bash
cd backend
npm run dev
```

Terminal 2 - Frontend:
```bash
cd ..
python3 -m http.server 8000
```

Visit http://localhost:8000

#### Production Mode

```bash
cd backend
npm start
```

## Deployment to Heroku

### 1. Prepare for Deployment

1. Create a `Procfile` in the backend directory:
```
web: node server.js
```

2. Ensure `package.json` has correct start script:
```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

### 2. Deploy Backend

```bash
# Login to Heroku
heroku login

# Create new app
heroku create basc69-schedule-backend

# Add MySQL addon
heroku addons:create jawsdb:kitefin

# Get database URL
heroku config:get JAWSDB_URL

# Set environment variables
heroku config:set WCA_CLIENT_ID=your_client_id
heroku config:set WCA_CLIENT_SECRET=your_client_secret
heroku config:set WCA_CALLBACK_URL=https://basc69-schedule-backend.herokuapp.com/auth/wca/callback
heroku config:set SESSION_SECRET=your_session_secret
heroku config:set COMPETITION_ID=BayAreaSpeedcubin692026
heroku config:set FRONTEND_URL=https://your-github-pages-url.github.io/BASC69-Schedule
heroku config:set NODE_ENV=production

# Deploy
cd backend
git init
git add .
git commit -m "Initial commit"
heroku git:remote -a basc69-schedule-backend
git push heroku main

# Setup database
heroku run bash
# Then run: mysql -h [host] -u [user] -p [database] < schema.sql
```

### 3. Deploy Frontend

The frontend can be deployed to GitHub Pages:

1. Push your code to GitHub
2. Go to repository Settings → Pages
3. Select branch and folder
4. Update API_BASE_URL in `groups.js` to your Heroku backend URL

### 4. Update OAuth Application

Update your WCA OAuth application redirect URI to:
```
https://basc69-schedule-backend.herokuapp.com/auth/wca/callback
```

## API Endpoints

### Authentication
- `GET /auth/wca` - Start OAuth flow
- `GET /auth/wca/callback` - OAuth callback
- `GET /auth/me` - Get current user
- `POST /auth/logout` - Logout

### Groups
- `GET /api/groups` - Get available groups for logged-in competitor
- `POST /api/groups/select` - Select a group
- `GET /api/groups/:activityId` - Get group info for activity

### Admin (Delegates Only)
- `GET /api/admin/check` - Check if user is delegate
- `GET /api/admin/pending-groups` - View all group selections
- `POST /api/admin/write-wcif` - Write groups to WCIF
- `GET /api/admin/write-history` - View write history

## Configuration Files

### groups-config.json
Specifies which events have group selection and capacity limits.

### custom-info.json
Provides custom information for events (time limits, formats, descriptions).

## Development

### Running Tests
```bash
cd backend
npm test
```

### Debugging

Enable debug logs:
```bash
NODE_ENV=development npm run dev
```

Check logs:
```bash
heroku logs --tail
```

## Troubleshooting

### "Not authenticated" error
- Clear browser cookies
- Re-login with WCA account
- Check session configuration

### "Failed to fetch WCIF"
- Verify COMPETITION_ID is correct
- Check WCA API is accessible
- Ensure WCIF is public or you're authenticated

### Database connection errors
- Verify DATABASE_URL format
- Check MySQL is running
- Ensure database exists

### Group selection not showing
- Verify competitor is registered for the competition
- Check groups-config.json has correct activity names
- Ensure activity names match WCIF exactly

## Security Notes

- Never commit `.env` file
- Keep OAuth secrets secure
- Use HTTPS in production
- Validate all user inputs
- Implement rate limiting in production

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
- Email: [your-email]
- GitHub Issues: [repository-url]/issues

## Acknowledgments

- World Cube Association for WCIF API
- Delegate Dashboard for WCIF write patterns
