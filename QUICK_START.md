# BASC 69 Group Selection - Quick Reference

## 🚀 Quick Start

```bash
# 1. Run setup
./setup.sh

# 2. Configure .env file
cd backend
nano .env  # or use your preferred editor

# 3. Start backend
npm run dev

# 4. Start frontend (in new terminal)
cd ..
python3 -m http.server 8000
```

## 🔐 WCA OAuth Setup

1. Go to: https://www.worldcubeassociation.org/oauth/applications
2. Create new application
3. Set redirect URI: `http://localhost:3000/auth/wca/callback`
4. Copy Client ID and Secret to `.env`

## 📋 Environment Variables

```env
# Required
WCA_CLIENT_ID=          # From WCA OAuth app
WCA_CLIENT_SECRET=      # From WCA OAuth app
SESSION_SECRET=         # Generate with: openssl rand -hex 32
DATABASE_URL=           # mysql://user:pass@host:port/database

# Optional
PORT=3000              # Backend port
FRONTEND_URL=          # Frontend URL for CORS
COMPETITION_ID=        # WCA competition ID
```

## 🗄️ Database Commands

```bash
# Create database
mysql -u root -p < backend/schema.sql

# Check database
mysql -u root -p -e "USE basc69_groups; SHOW TABLES;"

# Reset database
mysql -u root -p -e "DROP DATABASE basc69_groups;"
mysql -u root -p < backend/schema.sql
```

## 📡 API Endpoints

### Authentication
```
GET  /auth/wca           → Start OAuth login
GET  /auth/wca/callback  → OAuth callback (auto)
GET  /auth/me            → Get current user
POST /auth/logout        → Logout
```

### Groups (Competitor)
```
GET  /api/groups                  → Get available groups
POST /api/groups/select           → Select a group
     Body: { activityId, groupNumber }
GET  /api/groups/:activityId      → Get group info
```

### Admin (Delegate Only)
```
GET  /api/admin/check              → Check if delegate
GET  /api/admin/pending-groups     → View selections
POST /api/admin/write-wcif         → Write to WCA
GET  /api/admin/write-history      → View write logs
```

## 🎨 Frontend Components

- **Schedule Tab**: Original schedule viewer
- **Group Selection Tab**: Competitor group selection
- **Admin Tab**: Delegate management (auto-shown for delegates)

## ⚙️ Configuration Files

### groups-config.json
```json
{
  "groupSettings": {
    "Activity Name": {
      "numGroups": 4,
      "maxPerGroup": 24
    }
  }
}
```

**Important**: Use exact activity names from WCIF schedule!

### custom-info.json
```json
{
  "activityInfo": {
    "Activity Name": {
      "description": "...",
      "customTimeLimit": "1:00:00.00"
    }
  }
}
```

## 🐛 Common Issues

### "Not authenticated"
- Clear cookies and re-login
- Check SESSION_SECRET is set
- Verify database connection

### "Activity not found"
- Check activity name in groups-config.json
- Must match WCIF exactly (case-sensitive)
- Include "Round 1", "Round 2", etc.

### "Group is full"
- Capacity set in groups-config.json
- Default is 24 competitors
- Check current count in admin panel

### Database connection failed
- Verify MySQL is running
- Check DATABASE_URL format
- Test: `mysql -u user -p database`

## 📊 Testing Flow

1. **Setup**: Create WCA OAuth app, configure .env
2. **Database**: Run schema.sql
3. **Backend**: Start with `npm run dev`
4. **Frontend**: Serve with Python or similar
5. **Login**: Click "Login with WCA"
6. **Select**: Choose groups for your events
7. **Admin**: (Delegates) View and write to WCIF

## 🚀 Deployment Checklist

- [ ] Update WCA OAuth redirect URI to production URL
- [ ] Set production environment variables on host
- [ ] Use HTTPS in production
- [ ] Set NODE_ENV=production
- [ ] Configure production database (JawsDB, PlanetScale, etc.)
- [ ] Update FRONTEND_URL to production domain
- [ ] Update API_BASE_URL in groups.js
- [ ] Test OAuth flow end-to-end
- [ ] Test WCIF write as delegate
- [ ] Enable rate limiting (optional)

## 📞 Support

Questions? Check:
- README_GROUPS.md for full documentation
- backend/routes/ for API implementation
- Developer console for frontend errors
- Backend logs for server errors

## 🔧 Development Commands

```bash
# Backend
cd backend
npm install         # Install dependencies
npm run dev         # Start with auto-reload
npm start          # Start production mode
npm test           # Run tests (if added)

# Frontend
python3 -m http.server 8000         # Python 3
python -m SimpleHTTPServer 8000     # Python 2
npx serve                           # Node.js option

# Database
mysql -u root -p basc69_groups      # Open MySQL prompt
```

## 📦 File Structure

```
BASC69 Schedule/
├── index.html           # Main page
├── script.js           # Schedule logic
├── groups.js           # Group selection logic
├── styles.css          # All styles
├── groups-config.json  # Group configuration
├── custom-info.json    # Event info
├── backend/
│   ├── server.js       # Main server
│   ├── package.json    # Dependencies
│   ├── schema.sql      # Database
│   ├── routes/         # API routes
│   ├── middleware/     # Auth middleware
│   ├── config/         # OAuth config
│   └── utils/          # Helper functions
└── README_GROUPS.md    # Full docs
```
