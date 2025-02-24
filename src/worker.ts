import { Bot, webhookCallback, Context, session, SessionFlavor, InlineKeyboard, InputFile } from "grammy";
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
    thumbnailPicture?: string;
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
    "1/14 - What is your project name? 🏷️",
    "2/14 - One sentence to describe your project 💎",
    "3/14 - Send your project picture in jpg or png format 🖼️",
    "4/14 - Send your thumbnail picture in jpg or png format 🖼️",
    "5/14 - Your website Link 🌐",
    "6/14 - Your telegram OR discord link (your main channel to communicate your community) 💬",
    "7/14 - Your X link 🐦",
    "8/14 - Select the chain you want to deploy on ⛓️",
    "9/14 - What is your sector? 🎯 (Depin / SocialFi / DeFi etc.)",
    "10/14 - When do you plan to do your TGE? 📅",
    "11/14 - Select your FDV range 💰",
    "12/14 - Your token TICKER $XXXXX 🎫 (must start with '$' and be up to 5 characters long in uppercase).",
    "13/14 - Send your token picture in jpg or png format 🖼️",
    "14/14 - To provide the most information to your investors - and make them want to invest - you need a data room 📚\n\nExamples:\nAmbient: https://borgpad-data-room.notion.site/moemate?pvs=4\nSolana ID: https://www.solana.id/solid\n\nHere is a template: https://docs.google.com/document/d/1j3hxzO8_9wNfWfVxGNRDLFV8TJectQpX4bY6pSxCLGs/edit?tab=t.0\n\nShare the link of your data room 📝"
];

// Storage adapter pour Cloudflare KV
class CloudflareStorage {
    constructor(private namespace: KVNamespace) {}

    async read(key: string) {
        try {
            console.log('Reading session for key:', key);
            const value = await this.namespace.get(key);
            console.log('Read value from KV:', value);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('Error reading from KV:', error);
            return null;
        }
    }

    async write(key: string, value: any) {
        try {
            console.log('Writing session for key:', key);
            console.log('Writing value:', JSON.stringify(value));
            await this.namespace.put(key, JSON.stringify(value));
            // Vérification immédiate
            const written = await this.read(key);
            console.log('Verification after write:', written);
        } catch (error) {
            console.error('Error writing to KV:', error);
        }
    }

    async delete(key: string) {
        try {
            await this.namespace.delete(key);
        } catch (error) {
            console.error('Error deleting from KV:', error);
        }
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
    thumbnailPicture TEXT,
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
        if (currentQuestion === 7) { // Chain question
            const keyboard = new InlineKeyboard()
                .text("Solana 🟪", "chain_Solana")
                .text("Avalanche 🔺", "chain_Avalanche")
                .row()
                .text("Abstract 🟩", "chain_Abstract")
                .text("Base 🟦", "chain_Base")
                .row()
                .text("Sonic 🟡", "chain_Sonic"); // Added Sonic chain
            
            await ctx.reply(questions[currentQuestion], { reply_markup: keyboard });
        }
        else if (currentQuestion === 9) { // TGE date
            const keyboard = new InlineKeyboard()
                .text("1-2 weeks", "tge_1-2 weeks")
                .text("1-2 months", "tge_1-2 months")
                .row()
                .text("2+ months", "tge_2+ months");
            
            await ctx.reply(questions[currentQuestion], { reply_markup: keyboard });
        }
        else if (currentQuestion === 10) { // FDV
            const keyboard = new InlineKeyboard()
                .text("1M-5M", "fdv_$1M - $5M")
                .text("5M-10M", "fdv_$5M - $10M")
                .row()
                .text("10M-25M", "fdv_$10M - $25M")
                .text("25M-50M", "fdv_$25M - $50M");
            
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
                projectPicture, thumbnailPicture, websiteLink, communityLink, xLink,
                chain, sector, tgeDate, fdv, ticker, tokenPicture,
                dataRoom, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
            userId,
            answers.twitterUsername || '',
            answers.projectName || '',
            answers.description || '',
            answers.projectPicture || '',
            answers.thumbnailPicture || '',
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

        // Créer l'objet JSON au format souhaité
        const projectJson = {
            id: answers.projectName,
            config: {
                cluster: "mainnet",
                lpPositionToBeBurned: true,
                raiseTargetInUsd: 100000,
                fdv: parseInt(answers.fdv?.split('-')[0].replace(/[^0-9]/g, '') || '0') * 1000000, // Extraire le premier nombre du FDV et ajouter 6 zéros
                marketCap: 0,
                totalTokensForLiquidityPool: 14285714,
                totalTokensForRewardDistribution: 14285714,
                rewardsDistributionTimeInMonths: 6,
                finalSnapshotTimestamp: null,
                lbpWalletAddress: null,
                raisedTokenData: {
                    iconUrl: "https://files.borgpad.com/usdc-logo.png",
                    ticker: "USDC",
                    mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                    decimals: 6,
                    fixedTokenPriceInUsd: 1,
                    coinGeckoName: "usd"
                },
                launchedTokenData: {
                    iconUrl: answers.tokenPicture,
                    ticker: answers.ticker?.replace('$', '') || '',
                    mintAddress: null,
                    decimals: null,
                    fixedTokenPriceInUsd: 0.007
                }
            },
            info: {
                claimUrl: null,
                tweetUrl: null,
                tokenContractUrl: null,
                poolContractUrl: null,
                projectType: "draft-pick",
                title: answers.projectName,
                subtitle: answers.description,
                logoUrl: answers.projectPicture,
                thumbnailUrl: answers.thumbnailPicture,
                origin: "The Singularity",
                sector: answers.sector,
                tokenGenerationEventDate: answers.tgeDate,
                targetFdv: answers.fdv,
                chain: {
                    name: answers.chain,
                    iconUrl: "https://files.borgpad.com/images/zkagi/solana-small.jpg"
                },
                dataRoom: {
                    backgroundImgUrl: "",
                    url: answers.dataRoom
                },
                liquidityPool: {
                    name: "Raydium",
                    iconUrl: "https://files.borgpad.com/images/shared/raydium-logo-small.png",
                    lbpType: "Mixed",
                    lockingPeriod: "∞"
                },
                curator: {
                    avatarUrl: "",
                    fullName: "TBD",
                    position: "TBD",
                    socials: [
                      {
                        iconType: "WEB",
                        url: "",
                        label: "Web"
                      },
                      {
                        iconType: "X_TWITTER",
                        url: "https://x.com/",
                        label: ""
                      }
                    ]
                  },
                projectLinks: [
                    {
                        iconType: "WEB",
                        url: answers.websiteLink,
                        label: ""
                    },
                    {
                        iconType: "Telegram",
                        url: answers.communityLink,
                        label: ""
                    },
                    {
                        iconType: "X_TWITTER",
                        url: answers.xLink,
                        label: ""
                    }
                ],
                timeline: [
                    {
                        id: "REGISTRATION_OPENS",
                        label: "Registration Opens",
                        date: null
                    },
                    {
                        id: "SALE_OPENS",
                        label: "Sale Opens",
                        date: null
                    },
                    {
                        id: "SALE_CLOSES",
                        label: "Sale Closes",
                        date: null
                    },
                    {
                        id: "REWARD_DISTRIBUTION",
                        label: "Reward Distribution",
                        date: null
                    },
                    {
                        id: "DISTRIBUTION_OVER",
                        label: "Distribution Over",
                        date: null
                    }
                ],
                tiers: [
                    {
                        id: "tier10",
                        label: "Borgers Club.",
                        quests: [
                            {
                                type: "HOLD_TOKEN",
                                tokenName: "BORG",
                                tokenAmount: "1000",
                                tokenMintAddress: "3dQTr7ror2QPKQ3GbBCokJUmjErGg8kTJzdnYjNfvi3Z"
                            }
                        ],
                        benefits: {
                            startDate: "2025-03-18T15:00:00Z",
                            minInvestment: "100",
                            maxInvestment: "500"
                        }
                    },
                    {
                        id: "tier99",
                        label: "Public Sale",
                        quests: [],
                        benefits: {
                            startDate: "2025-03-18T18:15:00Z",
                            minInvestment: "10",
                            maxInvestment: "250"
                        }
                    }
                ]
            }
        };

        // Sauvegarder dans la table projects_json
        await env.DB.prepare(`
            INSERT OR REPLACE INTO projects_json (id, json)
            VALUES (?, ?)
        `).bind(
            answers.projectName,
            JSON.stringify(projectJson)
        ).run();

        const summary = `
📋 Project Summary:

🏷️ Project Name: ${answers.projectName}
💎 Description: ${answers.description}
🖼️ Project Picture: ${answers.projectPicture ? 'Saved ✅' : 'Not provided'}
🖼️ Thumbnail Picture: ${answers.thumbnailPicture ? 'Saved ✅' : 'Not provided'}
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

// Fonction commune pour traiter les images
async function handleImage(ctx: MyContext, env: Env, fileUrl: string, isToken: boolean) {
    try {
        const r2Url = await saveImageToR2(
            fileUrl,
            ctx.session.answers.projectName || 'unknown',
            isToken,
            env
        );

        if (isToken) {
            ctx.session.answers.tokenPicture = r2Url;
        } else if (ctx.session.answers.currentQuestion === 3) {
            ctx.session.answers.thumbnailPicture = r2Url;
        } else {
            ctx.session.answers.projectPicture = r2Url;
        }

        ctx.session.answers.currentQuestion++;
        await askNextQuestion(ctx, env);
    } catch (error) {
        console.error('Error handling image:', error);
        await ctx.reply("Error processing image. Please try again.");
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

        // Middleware de debug et initialisation de session
        bot.use(async (ctx, next) => {
            try {
                // Lire d'abord la session existante
                if (ctx.from?.id) {
                    const storage = new CloudflareStorage(env.SESSION_STORE);
                    const existingSession = await storage.read(ctx.from.id.toString());
                    
                    if (existingSession) {
                        ctx.session = existingSession;
                        console.log('Loaded existing session:', existingSession);
                    } else {
                        // Initialiser une nouvelle session seulement si aucune n'existe
                        console.log('No existing session found, creating new one');
                        ctx.session = {
                            answers: {
                                currentQuestion: 0,
                                twitterConnected: false,
                                twitterUsername: '',
                                projectName: '',
                                description: '',
                                projectPicture: '',
                                thumbnailPicture: '',
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
                        await storage.write(ctx.from.id.toString(), ctx.session);
                    }
                }

                await next();
                
                // Sauvegarder les modifications de session
                if (ctx.from?.id && ctx.session) {
                    const storage = new CloudflareStorage(env.SESSION_STORE);
                    await storage.write(ctx.from.id.toString(), ctx.session);
                }
            } catch (error) {
                console.error('Session middleware error:', error);
                throw error;
            }
        });

        // Configuration de la session (après le middleware)
        bot.use(session<SessionData, MyContext>({
            initial: () => ({
                answers: {
                    currentQuestion: 0,
                    twitterConnected: false,
                    twitterUsername: '',
                    projectName: '',
                    description: '',
                    projectPicture: '',
                    thumbnailPicture: '',
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
            storage: new CloudflareStorage(env.SESSION_STORE),
            getSessionKey: (ctx) => ctx.from?.id?.toString()
        }));

        // Commande /start
        bot.command("start", async (ctx) => {
            console.log('Start command received:', ctx.message?.text);
            const userName = ctx.from?.first_name || "there";
            
            // Si c'est un callback Twitter
            if (ctx.message?.text?.includes('twitter_success_')) {
                console.log('Processing Twitter success');
                try {
                    const username = ctx.message.text.split('twitter_success_')[1];
                    
                    // Forcer l'initialisation de la session si nécessaire
                    if (!ctx.session) {
                        ctx.session = {
                            answers: {
                                currentQuestion: 0,
                                twitterConnected: false,
                                twitterUsername: '',
                                projectName: '',
                                description: '',
                                projectPicture: '',
                                thumbnailPicture: '',
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

                    // Mettre à jour l'état de connexion Twitter
                    ctx.session.answers.twitterConnected = true;
                    ctx.session.answers.twitterUsername = username;

                    // Forcer la sauvegarde immédiate de la session
                    if (ctx.from?.id) {
                        const storage = new CloudflareStorage(env.SESSION_STORE);
                        await storage.write(ctx.from.id.toString(), ctx.session);
                    }

                    await ctx.reply(`Welcome @${username}! 👋\n\nLet's start with some questions about your project.`);
                    await askNextQuestion(ctx, env);
                } catch (error) {
                    console.error('Error in Twitter callback:', error);
                    await ctx.reply("An error occurred while connecting your Twitter account. Please try again.");
                }
                return;
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
            console.log('Session state:', {
                exists: !!ctx.session,
                twitterConnected: ctx.session?.answers?.twitterConnected,
                username: ctx.session?.answers?.twitterUsername
            });

            // Vérifier si Twitter est connecté
            if (!ctx.session?.answers?.twitterConnected) {
                const keyboard = new InlineKeyboard()
                    .url("Connect with X 🐦", generateTwitterAuthUrl(env));
                    
                await ctx.reply("Please connect your X account first! 🐦", { reply_markup: keyboard });
                return;
            }

            console.log('Current question:', ctx.session.answers.currentQuestion);
            console.log('Received message:', ctx.message);

            if (ctx.session.answers.currentQuestion >= questions.length) return;

            const answers = ctx.session.answers;
            const currentQuestion = answers.currentQuestion;

            let shouldMoveToNextQuestion = true;

            // Vérifier si une image est attendue
            if (currentQuestion === 2 || currentQuestion === 3 || currentQuestion === 12) {
                if (!ctx.message.photo && !ctx.message.document) {
                    await ctx.reply("Please send an image (jpg or png format) 🖼️");
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
                if (ctx.message.photo && (currentQuestion === 2 || currentQuestion === 3 || currentQuestion === 12)) {
                    const photo = ctx.message.photo[0]; // Utiliser la première version (non compressée)
                    const file = await ctx.api.getFile(photo.file_id);
                    
                    if (!file.file_path) {
                        await ctx.reply("Error: Couldn't get the file path. Please try sending the image as a file.");
                        shouldMoveToNextQuestion = false;
                        return;
                    }

                    const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
                    
                    // Sauvegarder l'image dans R2
                    await handleImage(ctx, env, fileUrl, currentQuestion === 12);
                    return; // Ajout de ce return pour éviter le double traitement
                    
                } else if (ctx.message.text) {
                    switch (currentQuestion) {
                        case 0: answers.projectName = ctx.message.text; break;
                        case 1: 
                            if (ctx.message.text.length > 80) {
                                await ctx.reply("Description too long! Please limit your description to 80 characters (spaces included). Current length: " + ctx.message.text.length);
                                shouldMoveToNextQuestion = false;
                                return;
                            }
                            answers.description = ctx.message.text;
                            break;
                        case 2: answers.projectPicture = ctx.message.text; break;
                        case 3: answers.thumbnailPicture = ctx.message.text; break;
                        case 4: answers.websiteLink = ctx.message.text; break;
                        case 5: answers.communityLink = ctx.message.text; break;
                        case 6: answers.xLink = ctx.message.text; break;
                        case 7: answers.chain = ctx.message.text; break;
                        case 8: answers.sector = ctx.message.text; break;
                        case 9: answers.tgeDate = ctx.message.text; break;
                        case 10: answers.fdv = ctx.message.text; break;
                        case 11: 
                            if (!ctx.message.text.startsWith('$') || ctx.message.text.length > 6) {
                                await ctx.reply("Invalid ticker format. Must start with '$' and be up to 5 characters long in uppercase. 💔");
                                shouldMoveToNextQuestion = false;
                                return;
                            }
                            answers.ticker = ctx.message.text;
                            break;
                        case 13:
                            answers.dataRoom = ctx.message.text;
                            console.log('Saving dataRoom:', ctx.message.text);
                            
                            // Force la sauvegarde dans le KV
                            if (ctx.from?.id) {
                                const storage = new CloudflareStorage(env.SESSION_STORE);
                                await storage.write(ctx.from.id.toString(), ctx.session);
                                console.log('Session saved with dataRoom:', ctx.session);
                            }
                            break;
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

        // Gestionnaire pour les photos (compressées)
        bot.on("message:photo", async (ctx) => {
            const currentQuestion = ctx.session.answers.currentQuestion;
            
            if (currentQuestion === 2 || currentQuestion === 3 || currentQuestion === 12) {
                const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Meilleure qualité disponible
                const file = await ctx.api.getFile(photo.file_id);
                
                if (!file.file_path) {
                    await ctx.reply("Error: Couldn't get the file path. Please try again.");
                    return;
                }

                const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
                await handleImage(ctx, env, fileUrl, currentQuestion === 12);
            }
        });

        // Gestionnaire pour les documents (non compressés)
        bot.on("message:document", async (ctx) => {
            const currentQuestion = ctx.session.answers.currentQuestion;
            
            if (currentQuestion === 2 || currentQuestion === 3 || currentQuestion === 12) {
                const doc = ctx.message.document;
                
                if (!doc.mime_type?.startsWith('image/')) {
                    await ctx.reply("Please send a valid image file (jpg or png).");
                    return;
                }

                const file = await ctx.api.getFile(doc.file_id);
                if (!file.file_path) {
                    await ctx.reply("Error: Couldn't get the file path. Please try again.");
                    return;
                }

                const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
                await handleImage(ctx, env, fileUrl, currentQuestion === 12);
            }
        });

        // Fonction utilitaire pour générer l'URL Twitter
        function generateTwitterAuthUrl(env: Env): string {
            const state = Math.random().toString(36).substring(7);
            const params = new URLSearchParams({
                'response_type': 'code',
                'client_id': env.TWITTER_CLIENT_ID,
                'redirect_uri': env.TWITTER_CALLBACK_URL,
                'scope': 'users.read tweet.read offline.access',
                'state': state,
                'code_challenge': 'challenge',
                'code_challenge_method': 'plain'
            });

            return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
        }

        // Ajouter le gestionnaire de boutons
        bot.on("callback_query", async (ctx) => {
            const data = ctx.callbackQuery.data;
            const answers = ctx.session.answers;

            // Gérer les différents boutons
            if (data?.startsWith("chain_")) {
                answers.chain = data.replace("chain_", "");
                await ctx.reply(`Chain selected: ${answers.chain} ✅`);
            }
            else if (data?.startsWith("tge_")) {
                answers.tgeDate = data.replace("tge_", "");
                await ctx.reply(`TGE date selected: ${answers.tgeDate} ✅`);
            }
            else if (data?.startsWith("fdv_")) {
                answers.fdv = data.replace("fdv_", "");
                await ctx.reply(`FDV selected: ${answers.fdv} ✅`);
            }

            // Confirmer la sélection
            // await ctx.answerCallbackQuery({ text: "Selection saved! ✅" });
            
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
