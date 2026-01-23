# Bay Area Speedcubin' 69 2026 - Schedule Website

A beautiful, responsive website for displaying the Bay Area Speedcubin' 69 2026 WCA competition schedule.

## 🎯 Features

- **Live Data**: Fetches competition data from the WCA WCIF API
- **Interactive Schedule**: Browse schedule by day with color-coded rooms
- **Event Details**: View all events and rounds with format and time limit information
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- **Modern UI**: Clean, animated interface with smooth transitions

## 🚀 Quick Start

1. Open `index.html` in a web browser
2. The website will automatically fetch and display the competition schedule

## 📁 Project Structure

```
BASC69 Schedule/
├── index.html          # Main HTML structure
├── styles.css          # Styling and responsive design
├── script.js           # JavaScript for fetching and displaying data
├── README.md           # Project documentation
└── .github/
    └── copilot-instructions.md  # Project context
```

## 🌐 API Endpoint

The website fetches data from:
```
https://api.worldcubeassociation.org/competitions/BayAreaSpeedcubin692026/wcif/public
```

## 💻 Technology Stack

- **HTML5**: Semantic structure
- **CSS3**: Modern styling with flexbox, grid, and animations
- **Vanilla JavaScript**: Fetch API for data retrieval and DOM manipulation
- **WCA WCIF**: World Cube Association Competition Interchange Format

## 📱 Responsive Breakpoints

- **Desktop**: 1200px and above
- **Tablet**: 768px - 1199px
- **Mobile**: Below 768px

## 🎨 Features Breakdown

### Competition Information
- Competition name, dates, and venue

### Schedule View
- Day-by-day navigation
- Room-based timeline with color coding
- Activity times and durations
- Activity codes for reference

### Events & Rounds
- All competition events with icons
- Round details (format, time limits, cutoffs)
- Advancement conditions

## 🔧 Customization

To customize the website:

1. **Colors**: Edit CSS variables in `styles.css`:
```css
:root {
    --primary-color: #304a96;
    --secondary-color: #6e9730;
    --accent-color: #973030;
    /* ... */
}
```

2. **API Endpoint**: Change the URL in `script.js`:
```javascript
const API_URL = 'your-api-url-here';
```

## 📝 License

This project is created for the Bay Area Speedcubin' 69 2026 competition.

## 🙏 Acknowledgments

- World Cube Association for the WCIF API
- Competition organizers and delegates
- Berkeley Cube Club

## 📞 Contact

For questions about the competition, visit:
https://www.worldcubeassociation.org/competitions/BayAreaSpeedcubin692026

---

Made with ❤️ for the cubing community
