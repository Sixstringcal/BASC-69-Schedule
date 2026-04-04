import passport from 'passport';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import axios from 'axios';
import { WCAUser } from '../types';

const WCA_ORIGIN = process.env.WCA_ORIGIN || 'https://www.worldcubeassociation.org';

passport.use('wca', new OAuth2Strategy({
    authorizationURL: `${WCA_ORIGIN}/oauth/authorize`,
    tokenURL: `${WCA_ORIGIN}/oauth/token`,
    clientID: process.env.WCA_CLIENT_ID || '',
    clientSecret: process.env.WCA_CLIENT_SECRET || '',
    callbackURL: process.env.WCA_CALLBACK_URL || '',
    scope: ['public', 'email', 'manage_competitions']
}, async (accessToken: string, refreshToken: string, _profile: any, done: any) => {
    try {
        const response = await axios.get(`${WCA_ORIGIN}/api/v0/me`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        const user: WCAUser = {
            ...response.data.me,
            accessToken,
            refreshToken
        };
        
        return done(null, user);
    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user: any, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
    done(null, { id } as Express.User);
});

export default passport;
