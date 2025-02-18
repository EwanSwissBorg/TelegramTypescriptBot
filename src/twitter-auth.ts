import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const CALLBACK_URL = process.env.TWITTER_CALLBACK_URL;

if (!CLIENT_ID || !CLIENT_SECRET || !CALLBACK_URL) {
    throw new Error('Twitter credentials must be provided in .env file');
}

// Créer le client Twitter
const client = new TwitterApi({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
});

export async function getTwitterAuthLink(state: string) {
    const { url, codeVerifier, state: authState } = await client.generateOAuth2AuthLink(
        CALLBACK_URL || '',
        { scope: ['tweet.read', 'users.read'] }
    );
    
    return {
        url,
        codeVerifier,
        state: authState,
    };
}

export async function validateTwitterAuth(code: string, codeVerifier: string) {
    try {
        const { accessToken, refreshToken } = await client.loginWithOAuth2({
            code,
            codeVerifier,
            redirectUri: CALLBACK_URL || '',
        });

        const twitterClient = new TwitterApi(accessToken);
        const { data: userObject } = await twitterClient.v2.me();

        return {
            success: true,
            userId: userObject.id,
            username: userObject.username,
        };
    } catch (error) {
        console.error('Twitter auth error:', error);
        return {
            success: false,
            error: 'Authentication failed',
        };
    }
} 