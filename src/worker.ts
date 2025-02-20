import { Bot, webhookCallback, Context, session, SessionFlavor, InlineKeyboard } from "grammy";
import { FileAdapter } from "@grammyjs/storage-file";
import { D1Database, ExecutionContext, KVNamespace } from "@cloudflare/workers-types";
import { R2Bucket } from "@cloudflare/workers-types";

// Interfaces
interface Env {
    BOT_TOKEN: string;
    TWITTER_CLIENT_ID: string;
    TWITTER_CLIENT_SECRET: string;
    TWITTER_CALLBACK_URL: string;
    SESSION_STORE: KVNamespace;
    DB: D1Database;
    BUCKET: R2Bucket;
    BUCKET_URL: string;
}

interface UserAnswers {
    twitterConnected?: boolean;
    twitterUsername?: string;
    projectName?: string;
    description?: string;
    projectPicture?: string;
    websiteLink?: string;
    communityLink?: string;
    xLink?: string;
    chain?: string;
    sector?: string;
    tgeDate?: string;
    fdv?: string;
    ticker?: string;
    tokenPicture?: string;
    dataRoom?: string;
    currentQuestion: number;
}

interface SessionData {
    answers: UserAnswers;
}

type MyContext = Context & SessionFlavor<SessionData>;

// Questions array
const questions = [
    "1/13 - What is your project name? 🏷️",
    "2/13 - One sentence to describe your project 💎",
    "3/13 - Send your project picture in jpg or png format 🖼️ (WITH COMPRESSION - so please ensure a high quality image first)",
    "4/13 - Your website Link 🌐",
    "5/13 - Your telegram OR discord link (your main channel to communicate your community) 💬",
    "6/13 - Your X link 🐦",
    "7/13 - Select the chain you want to deploy on ⛓️",
    "8/13 - What is your sector? 🎯 (Depin / SocialFi / DeFi etc.)",
    "9/13 - When do you plan to do your TGE? 📅",
    "10/13 - Select your FDV range 💰",
    "11/13 - Your token TICKER $XXXXX 🎫 (must start with '$' and be up to 5 characters long in uppercase).",
    "12/13 - Send your token picture in jpg or png format 🖼️ (WITH COMPRESSION - so please ensure a high quality image first)",
    "13/13 - To provide the most information to your investors - and make them want to invest - you need a data room 📚\n\nExamples:\nAmbient: https://borgpad-data-room.notion.site/moemate?pvs=4\nSolana ID: https://www.solana.id/solid\n\nHere is a template: https://docs.google.com/document/d/1j3hxzO8_9wNfWfVxGNRDLFV8TJectQpX4bY6pSxCLGs/edit?tab=t.0\n\nShare the link of your data room 📝"
];

// Storage adapter pour Cloudflare KV
class CloudflareStorage {
    constructor(private namespace: KVNamespace) {}

    async read(key: string) {
        const value = await this.namespace.get(key);
        return value ? JSON.parse(value) : null;
    }

    async write(key: string, value: any) {
        await this.namespace.put(key, JSON.stringify(value));
    }

    async delete(key: string) {
        await this.namespace.delete(key);
    }
}

// Migration SQL pour créer la table
const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    twitterUsername TEXT,
    projectName TEXT,
    description TEXT,
    projectPicture TEXT,
    websiteLink TEXT,
    communityLink TEXT,
    xLink TEXT,
    chain TEXT,
    sector TEXT,
    tgeDate TEXT,
    fdv TEXT,
    ticker TEXT,
    tokenPicture TEXT,
    dataRoom TEXT,
    createdAt TEXT
)`;

// Fonction pour poser la question suivante
async function askNextQuestion(ctx: MyContext, env: Env) {
    const currentQuestion = ctx.session.answers.currentQuestion;
    
    if (currentQuestion < questions.length) {
        // Créer les boutons pour les questions spécifiques
        if (currentQuestion === 6) { // Chain question
            const keyboard = new InlineKeyboard()
                .text("Solana 🟪", "chain_solana")
                .text("Avalanche 🔺", "chain_avalanche")
                .row()
                .text("Abstract 🟩", "chain_abstract")
                .text("Base 🟦", "chain_base");
            
            await ctx.reply(questions[currentQuestion], { reply_markup: keyboard });
        }
        else if (currentQuestion === 8) { // TGE date
            const keyboard = new InlineKeyboard()
                .text("1-2 weeks", "tge_1-2weeks")
                .text("1-2 months", "tge_1-2months")
                .row()
                .text("2+ months", "tge_2plus");
            
            await ctx.reply(questions[currentQuestion], { reply_markup: keyboard });
        }
        else if (currentQuestion === 9) { // FDV
            const keyboard = new InlineKeyboard()
                .text("1M-5M", "fdv_1-5m")
                .text("5M-10M", "fdv_5-10m")
                .row()
                .text("10M-25M", "fdv_10-25m")
                .text("25M-50M", "fdv_25-50m");
            
            await ctx.reply(questions[currentQuestion], { reply_markup: keyboard });
        }
        else {
            await ctx.reply(questions[currentQuestion]);
        }
    } else {
        await showSummary(ctx, env);
    }
}

// Fonction pour afficher le résumé
async function showSummary(ctx: MyContext, env: Env) {
    try {
        const answers = ctx.session.answers;
        const userId = ctx.from?.id.toString();
        console.log('Saving data for user:', userId);
        console.log('Answers:', JSON.stringify(answers, null, 2));

        // Vérifier si userId existe
        if (!userId) {
            throw new Error('User ID is undefined');
        }

        // Vérifier si les champs requis sont présents
        if (!answers.twitterUsername) {
            throw new Error('Twitter username is required');
        }

        // Sauvegarder dans D1 avec gestion des nulls
        const result = await env.DB.prepare(`
            INSERT INTO projects (
                userId, twitterUsername, projectName, description, 
                projectPicture, websiteLink, communityLink, xLink,
                chain, sector, tgeDate, fdv, ticker, tokenPicture,
                dataRoom, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
            userId,
            answers.twitterUsername || '',
            answers.projectName || '',
            answers.description || '',
            answers.projectPicture || '',
            answers.websiteLink || '',
            answers.communityLink || '',
            answers.xLink || '',
            answers.chain || '',
            answers.sector || '',
            answers.tgeDate || '',
            answers.fdv || '',
            answers.ticker || '',
            answers.tokenPicture || '',
            answers.dataRoom || ''
        ).run();

        console.log('DB insert result:', result);

        const summary = `
📋 Project Summary:

🏷️ Project Name: ${answers.projectName}
💎 Description: ${answers.description}
🖼️ Project Picture: ${answers.projectPicture ? 'Saved ✅' : 'Not provided'}
🌐 Website: ${answers.websiteLink}
💬 Community Link: ${answers.communityLink}
🐦 X Link: ${answers.xLink}
⛓️ Chain: ${answers.chain}
🎯 Sector: ${answers.sector}
📅 TGE Date: ${answers.tgeDate}
💰 FDV: ${answers.fdv}
🎫 Token Ticker: ${answers.ticker}
🖼️ Token Picture: ${answers.tokenPicture ? 'Saved ✅' : 'Not provided'}
📚 Data Room: ${answers.dataRoom}

🎉 Thank you for providing all the information!

Book a call : https://calendly.com/mark-borgpad/30min to validate all this together and move to the next step !
`;
        await ctx.reply(summary);
    } catch (error) {
        console.error('Detailed error:', error);
        console.error('Error stack:', (error as Error).stack);
        await ctx.reply("Database error: " + (error as Error).message);
    }
}

// Fonction pour sauvegarder l'image dans R2
async function saveImageToR2(imageUrl: string, projectName: string, isToken: boolean, env: Env): Promise<string> {
    try {
        // Nettoyer le nom du projet pour le chemin
        const cleanProjectName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        // Construire le chemin du fichier
        const fileName = isToken ? `${cleanProjectName}_token.png` : `${cleanProjectName}_logo.png`;
        const filePath = `images/${cleanProjectName}/${fileName}`;

        // Télécharger l'image depuis Telegram
        const response = await fetch(imageUrl);
        const imageBuffer = await response.arrayBuffer();

        // Sauvegarder dans R2
        await env.BUCKET.put(filePath, imageBuffer, {
            httpMetadata: {
                contentType: 'image/png'
            }
        });

        // Retourner l'URL complète avec le domaine personnalisé
        return `https://${env.BUCKET_URL}/${filePath}`;
    } catch (error) {
        console.error('Error saving image to R2:', error);
        throw error;
    }
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // Créer la table si elle n'existe pas
        await env.DB.prepare(CREATE_TABLE).run();

        // Gérer le callback Twitter
        if (request.url.includes('/twitter/callback')) {
            console.log('Received Twitter callback');
            const url = new URL(request.url);
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');

            if (!code || !state) {
                console.error('Missing code or state');
                return Response.json({ error: 'Missing parameters' }, { status: 400 });
            }

            // Récupérer le username depuis le token
            const response = await fetch('https://api.twitter.com/2/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${btoa(`${env.TWITTER_CLIENT_ID}:${env.TWITTER_CLIENT_SECRET}`)}`
                },
                body: new URLSearchParams({
                    'grant_type': 'authorization_code',
                    'code': code,
                    'redirect_uri': env.TWITTER_CALLBACK_URL,
                    'code_verifier': 'challenge'
                })
            });

            if (!response.ok) {
                return new Response('Error getting token', { status: 500 });
            }

            const data = await response.json();
            
            console.log('Access Token:', data.access_token);
            
            // Récupérer les infos utilisateur
            const userResponse = await fetch('https://api.twitter.com/2/users/me', {
                headers: {
                    'Authorization': `Bearer ${data.access_token}`
                }
            });

            const responseBody = await userResponse.text(); // Get the response as text
            console.log('Response Body:', responseBody); // Log the raw response

            if (responseBody.trim() === '') {
                console.error('Received empty response from Twitter API');
                return new Response('Error getting user info: Empty response', { status: 500 });
            }

            const userData = JSON.parse(responseBody); // Now parse the response body
            const username = userData.data.username;

            // Rediriger vers Telegram avec le username
            const botUsername = 'BorgPadStaginBot';
            const startParam = `twitter_success_${username}`;
            const redirectUrl = `https://t.me/${botUsername}?start=${startParam}`;
            
            console.log('Redirecting to:', redirectUrl);
            
            return Response.redirect(redirectUrl, 302);
        }

        const bot = new Bot<MyContext>(env.BOT_TOKEN);

        // Configuration de la session avec storage
        bot.use(session({
            initial: () => ({
                answers: {
                    currentQuestion: 0,
                    twitterConnected: false,
                    twitterUsername: '',
                    projectName: '',
                    description: '',
                    projectPicture: '',
                    websiteLink: '',
                    communityLink: '',
                    xLink: '',
                    chain: '',
                    sector: '',
                    tgeDate: '',
                    fdv: '',
                    ticker: '',
                    tokenPicture: '',
                    dataRoom: ''
                }
            }),
            storage: new CloudflareStorage(env.SESSION_STORE)
        }));

        // Middleware de debug
        bot.use(async (ctx, next) => {
            console.log('Session before:', ctx.session);
            await next();
            console.log('Session after:', ctx.session);
        });

        // Commande /start
        bot.command("start", async (ctx) => {
            console.log('Start command received:', ctx.message?.text);
            const userName = ctx.from?.first_name || "there";
            
            // Si c'est un callback Twitter
            if (ctx.message?.text?.includes('twitter_success_')) {
                console.log('Processing Twitter success');
                try {
                    // Vérifiez si la session existe
                    if (!ctx.session) {
                        ctx.session = {
                            answers: {
                                currentQuestion: 0,
                                twitterConnected: false,
                                twitterUsername: '',
                                projectName: '',
                                description: '',
                                projectPicture: '',
                                websiteLink: '',
                                communityLink: '',
                                xLink: '',
                                chain: '',
                                sector: '',
                                tgeDate: '',
                                fdv: '',
                                ticker: '',
                                tokenPicture: '',
                                dataRoom: ''
                            }
                        };
                    }
                    
                    const username = ctx.message.text.split('twitter_success_')[1];
                    ctx.session.answers.twitterConnected = true;
                    ctx.session.answers.twitterUsername = username;
                    ctx.session.answers.currentQuestion = 0;

                    await ctx.reply(`Welcome @${username}! 👋\n\nLet's start with some questions about your project.`);
                    await askNextQuestion(ctx, env);
                    return;
                } catch (error) {
                    console.error('Error in Twitter callback:', error);
                    await ctx.reply("An error occurred while connecting your Twitter account. Please try again.");
                    return;
                }
            }

            // Générer le lien d'authentification Twitter
            try {
                const state = Math.random().toString(36).substring(7);
                const codeChallenge = 'challenge'; // PKCE requirement
                
                const params = new URLSearchParams({
                    'response_type': 'code',
                    'client_id': env.TWITTER_CLIENT_ID,
                    'redirect_uri': env.TWITTER_CALLBACK_URL,
                    'scope': 'users.read tweet.read offline.access',
                    'state': state,
                    'code_challenge': codeChallenge,
                    'code_challenge_method': 'plain'
                });

                const url = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
                console.log('Generated Twitter auth URL:', url);
                
                const keyboard = new InlineKeyboard()
                    .url("Connect with X 🐦", url)
                    .row();

                await ctx.reply(
                    `Welcome ${userName}! 👋\n\nI'm the BorgPad Curator Bot. First, please connect your X account:`,
                    { reply_markup: keyboard }
                );
            } catch (error) {
                console.error('Error generating Twitter auth link:', error);
                await ctx.reply("Sorry, there was an error setting up Twitter authentication. Please try again later.");
            }
        });

        // Gestionnaire de messages
        bot.on(["message:text", "message:photo"], async (ctx) => {
            // Vérifier si Twitter est connecté
            if (!ctx.session.answers.twitterConnected) {
                await ctx.reply("Please connect your X account first! 🐦");
                return;
            }

            console.log('Current question:', ctx.session.answers.currentQuestion);
            console.log('Received message:', ctx.message);

            if (ctx.session.answers.currentQuestion >= questions.length) return;

            const answers = ctx.session.answers;
            const currentQuestion = answers.currentQuestion;

            let shouldMoveToNextQuestion = true;

            // Vérifier si une image est attendue
            if (currentQuestion === 2 || currentQuestion === 11) {
                if (!ctx.message.photo) {
                    await ctx.reply("Please send an image (jpg or png format). 🖼️");
                    shouldMoveToNextQuestion = false;
                    return;
                }
            } else if (ctx.message.photo) {
                await ctx.reply("A text response is expected for this question. Please provide text. 📝");
                shouldMoveToNextQuestion = false;
                return;
            }

            // Gérer les réponses selon la question
            try {
                if (ctx.message.photo && (currentQuestion === 2 || currentQuestion === 11)) {
                    const photo = ctx.message.photo[ctx.message.photo.length - 1];
                    const file = await ctx.api.getFile(photo.file_id);
                    
                    if (!file.file_path) {
                        await ctx.reply("Error: Couldn't get the file path. Please try again.");
                        shouldMoveToNextQuestion = false;
                        return;
                    }

                    const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
                    
                    // Sauvegarder l'image dans R2
                    const r2Url = await saveImageToR2(
                        fileUrl,
                        ctx.session.answers.projectName || 'unknown',
                        currentQuestion === 11,
                        env
                    );
                    
                    if (currentQuestion === 2) {
                        answers.projectPicture = r2Url;
                    } else {
                        answers.tokenPicture = r2Url;
                    }
                } else if (ctx.message.text) {
                    switch (currentQuestion) {
                        case 0: answers.projectName = ctx.message.text; break;
                        case 1: answers.description = ctx.message.text; break;
                        case 3: answers.websiteLink = ctx.message.text; break;
                        case 4: answers.communityLink = ctx.message.text; break;
                        case 5: answers.xLink = ctx.message.text; break;
                        case 6: answers.chain = ctx.message.text; break;
                        case 7: answers.sector = ctx.message.text; break;
                        case 8: answers.tgeDate = ctx.message.text; break;
                        case 9: answers.fdv = ctx.message.text; break;
                        case 10: 
                            if (!ctx.message.text.startsWith('$') || ctx.message.text.length > 6) {
                                await ctx.reply("Invalid ticker format. Must start with '$' and be up to 5 characters long in uppercase. 💔");
                                shouldMoveToNextQuestion = false;
                                return;
                            }
                            answers.ticker = ctx.message.text;
                            break;
                        case 12: answers.dataRoom = ctx.message.text; break;
                    }
                }

                // Passer à la question suivante seulement si tout s'est bien passé
                if (shouldMoveToNextQuestion) {
                    answers.currentQuestion++;
                    console.log('Moving to question:', answers.currentQuestion);
                    await askNextQuestion(ctx, env);
                }
            } catch (error) {
                console.error('Error processing message:', error);
                await ctx.reply("An error occurred. Please try again.");
            }
        });

        // Ajouter le gestionnaire de boutons
        bot.on("callback_query", async (ctx) => {
            const data = ctx.callbackQuery.data;
            const answers = ctx.session.answers;

            // Gérer les différents boutons
            if (data?.startsWith("chain_")) {
                answers.chain = data.replace("chain_", "");
            }
            else if (data?.startsWith("tge_")) {
                answers.tgeDate = data.replace("tge_", "");
            }
            else if (data?.startsWith("fdv_")) {
                answers.fdv = data.replace("fdv_", "");
            }

            // Confirmer la sélection
            await ctx.answerCallbackQuery({ text: "Selection saved! ✅" });
            
            // Passer à la question suivante
            answers.currentQuestion++;
            await askNextQuestion(ctx, env);
        });

        try {
            await webhookCallback(bot, "cloudflare")({
                request,
                respondWith: (r) => r
            });
            return new Response("OK", { status: 200 });
        } catch (error) {
            console.error('Error in webhook handler:', error);
            return new Response('Error processing webhook', { status: 500 });
        }
    },
};
