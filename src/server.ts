import express from 'express';
import dotenv from 'dotenv';
import { validateTwitterAuth } from './twitter-auth';
import { FileAdapter } from "@grammyjs/storage-file";
// import { bot } from './bot';  // Exportez votre instance bot

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Stockage temporaire des code verifiers
const codeVerifiers = new Map<string, string>();

app.get('/twitter/callback', async (req: express.Request, res: express.Response) => {
    console.log('Received callback from Twitter');
    console.log('Query parameters:', req.query);
    
    const { code, state } = req.query;
    
    if (!code || !state) {
        console.log('Missing code or state');
        res.status(400).send('Missing parameters');
        return;
    }

    // Récupérer le code verifier associé à ce state
    const codeVerifier = codeVerifiers.get(state as string);
    console.log('Retrieved code verifier:', codeVerifier);

    if (!codeVerifier) {
        console.log('No code verifier found for state:', state);
        res.status(400).send('Invalid state');
        return;
    }

    try {
        // Valider l'authentification Twitter avec le code verifier
        const result = await validateTwitterAuth(code as string, codeVerifier);
        console.log('Twitter validation result:', result);

        if (result.success) {
            // Nettoyer le code verifier une fois utilisé
            codeVerifiers.delete(state as string);
            
            // Rediriger vers Telegram avec le nom d'utilisateur
            const redirectUrl = `https://t.me/typescriptewanbot?start=twitter_success_${result.username}`;
            console.log('Redirecting to:', redirectUrl);
            res.redirect(redirectUrl);
        } else {
            res.status(400).send('Twitter authentication failed');
        }
    } catch (error) {
        console.error('Error validating Twitter auth:', error);
        res.status(500).send('Internal server error');
    }
});

// Endpoint pour stocker le code verifier
app.get('/store-verifier', (req, res) => {
    const { state, codeVerifier } = req.query;
    if (state && codeVerifier) {
        codeVerifiers.set(state as string, codeVerifier as string);
        console.log('Stored code verifier for state:', state);
        res.send('OK');
    } else {
        res.status(400).send('Missing parameters');
    }
});

// Ajouter un middleware pour logger toutes les requêtes
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Callback URL: ${process.env.TWITTER_CALLBACK_URL}`);
}); 