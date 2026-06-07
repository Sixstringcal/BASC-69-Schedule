import dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import mysql from 'mysql2/promise';
import authRoutes from './routes/auth';
import groupRoutes from './routes/groups';
import adminRoutes from './routes/admin';
import unofficialRoutes from './routes/unofficial';

dotenv.config();

const app = express();

const pool = mysql.createPool(process.env.DATABASE_URL || '');

pool.query(`
    CREATE TABLE IF NOT EXISTS unofficial_registrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        wca_user_id VARCHAR(255) NOT NULL,
        registrant_id INT,
        event_id VARCHAR(50) NOT NULL,
        event_name VARCHAR(255) NOT NULL,
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_event (wca_user_id, event_id)
    )
`).catch(err => console.error('Failed to create unofficial_registrations table:', err));

app.locals.db = pool;

// CORS - Accept both the base domain and the full path
const allowedOrigins = [
    'https://sixstringcal.github.io',
    'https://sixstringcal.github.io/BASC-69-Schedule',
    'http://localhost:8000'
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        // Check if origin starts with allowed domains
        const isAllowed = allowedOrigins.some(allowed => 
            origin === allowed || origin.startsWith(allowed)
        );
        
        if (isAllowed) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/unofficial', unofficialRoutes);

app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
