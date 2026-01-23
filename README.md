# Bay Area Speedcubin' 69 2026 Schedule

A clean, responsive schedule website for BASC 69 2026.

## Setup

You need to run a local server for the JSON file to load properly:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Features

- Live schedule data from the WCA API
- Day-by-day navigation with color-coded rooms
- Detailed round information (format, time limits, cutoffs)
- Mobile-friendly responsive design
- Custom event descriptions and notes

## Project Structure

- `index.html` - Main page structure
- `styles.css` - All styling and responsive design
- `script.js` - Data fetching and schedule rendering
- `custom-info.json` - Custom round details and descriptions

## API Endpoint

Competition data is fetched from:
```
https://api.worldcubeassociation.org/competitions/BayAreaSpeedcubin692026/wcif/public
```

## Customization

**Colors:** Edit the CSS variables in `styles.css`:
```css
:root {
    --primary-color: #304a96;
    --secondary-color: #6e9730;
    --accent-color: #973030;
}
```

**Round Details:** Add custom info in `custom-info.json`:
```json
{
  "activityInfo": {
    "3x3x3 Cube, Round 1": {
      "description": "Your custom description here",
      "notes": "Important information for competitors"
    }
  }
}
```

## Credits

Built for Bay Area Speedcubin' 69 2026. Data provided by the World Cube Association.
