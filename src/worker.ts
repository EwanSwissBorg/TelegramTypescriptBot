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
    CF_ACCOUNT_ID: string;
    CF_API_TOKEN: string;
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
    fdvMin?: string;
    fdvMax?: string;
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
    "2/14 - One sentence to describe your project 💎 (Max 80 characters)",
    "3/14 - Send your project logo in jpg or png format 🖼️ (200x200px for optimal display)",
    "4/14 - Send your thumbnail picture in jpg or png format 🖼️ (600x330px for optimal display)",
    "5/14 - Your website Link 🌐",
    "6/14 - Your telegram OR discord link (your main channel to communicate your community) 💬",
    "7/14 - Your X link 🐦",
    "8/14 - Select the chain you want to deploy on ⛓️",
    "9/14 - What is your sector? 🎯 (Depin / SocialFi / DeFi etc.)",
    "10/14 - When do you plan to do your TGE? 📅",
    "11.A/14 - At which minimum FDV you want to launch 💰",
    "11.B/14 - At which maximum FDV you want to launch 💰",
    "12/14 - Your token TICKER $XXXXX 🎫 (must start with '$' and be up to 5 characters long in uppercase).",
    "13/14 - Send your token picture in jpg or png format 🖼️ (80x80px for optimal display)",
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
                .text("Sonic 🟡", "chain_Sonic");
            
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
        else if (currentQuestion === 10) { // FDV Min
            const keyboard = new InlineKeyboard()
                .text("$1M", "fdvMin_1")
                .text("$5M", "fdvMin_5")
                .text("$10M", "fdvMin_10")
                .row()
                .text("$15M", "fdvMin_15")
                .text("$20M", "fdvMin_20")
                .text("$25M", "fdvMin_25")
                .row()
                .text("$30M", "fdvMin_30")
                .text("$35M", "fdvMin_35")
                .text("$40M", "fdvMin_40")
                .row()
                .text("$45M", "fdvMin_45")
                .text("$50M", "fdvMin_50");
            
            await ctx.reply(questions[currentQuestion], { reply_markup: keyboard });
        }
        else if (currentQuestion === 11) { // FDV Max
            // Récupérer la valeur minimale pour filtrer les options
            const minValue = parseInt(ctx.session.answers.fdvMin || "1");
            
            // Créer un clavier avec seulement les valeurs supérieures au minimum
            const keyboard = new InlineKeyboard();
            
            // Première ligne
            if (5 > minValue) keyboard.text("$5M", "fdvMax_5");
            if (10 > minValue) keyboard.text("$10M", "fdvMax_10");
            if (15 > minValue) keyboard.text("$15M", "fdvMax_15");
            
            // Deuxième ligne (si au moins un bouton a été ajouté à la première ligne)
            if (keyboard.inline_keyboard.length > 0 && keyboard.inline_keyboard[0].length > 0) {
                keyboard.row();
            }
            
            // Ajouter les boutons de la deuxième ligne
            if (20 > minValue) keyboard.text("$20M", "fdvMax_20");
            if (25 > minValue) keyboard.text("$25M", "fdvMax_25");
            if (30 > minValue) keyboard.text("$30M", "fdvMax_30");
            
            // Troisième ligne (si au moins un bouton a été ajouté à la deuxième ligne)
            if (keyboard.inline_keyboard.length > 0 && keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1].length > 0) {
                keyboard.row();
            }
            
            // Ajouter les boutons de la troisième ligne
            if (35 > minValue) keyboard.text("$35M", "fdvMax_35");
            if (40 > minValue) keyboard.text("$40M", "fdvMax_40");
            if (45 > minValue) keyboard.text("$45M", "fdvMax_45");
            
            // Quatrième ligne (si au moins un bouton a été ajouté à la troisième ligne)
            if (keyboard.inline_keyboard.length > 0 && keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1].length > 0) {
                keyboard.row();
            }
            
            // Ajouter le bouton de la quatrième ligne
            if (50 > minValue) keyboard.text("$50M", "fdvMax_50");
            if (75 > minValue) keyboard.text("$75M", "fdvMax_75");
            if (100 > minValue) keyboard.text("$100M", "fdvMax_100");
            
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
        
        // S'assurer que le champ fdv est correctement défini
        if (answers.fdvMin && answers.fdvMax && !answers.fdv) {
            answers.fdv = `$${answers.fdvMin}M - $${answers.fdvMax}M`;
            console.log('Setting FDV range:', answers.fdv);
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
                fdv: parseInt(answers.fdvMin || '0') * 1000000, // Utiliser fdvMin pour le calcul
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
                targetFdv: answers.fdv || `$${answers.fdvMin || '0'}M - $${answers.fdvMax || '0'}M`, // Assurer que targetFdv est défini
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

        // Après avoir sauvegardé dans la base de données
        const notificationGroupId = "-1002474316235"; // ID du supergroupe
        const botAlerteThreadId = 2; // ID du topic "Bot Alerte"
        const notificationMessage = `
🎉 Nouveau projet soumis !

🏷️ Projet : ${answers.projectName}
👤 Par : @${answers.twitterUsername}
💎 Description : ${answers.description}
⛓️ Chain : ${answers.chain}
🎯 Sector : ${answers.sector}
📅 TGE : ${answers.tgeDate}
💰 FDV : ${answers.fdv}
🎫 Token : ${answers.ticker}

🌐 Website : ${answers.websiteLink}
💬 Community : ${answers.communityLink}
🐦 X : ${answers.xLink}
📚 Data Room : ${answers.dataRoom}
`;

        try {
            await ctx.api.sendMessage(notificationGroupId, notificationMessage, {
                message_thread_id: botAlerteThreadId // Spécifier le topic
            });
            console.log('Notification sent to Bot Alerte topic');
        } catch (error) {
            console.error('Error sending notification to group:', error);
        }

        await ctx.reply(summary);
    } catch (error) {
        console.error('Error in showSummary:', error);
        await ctx.reply("An error occurred while saving your project.");
    }
}

// Fonction pour sauvegarder l'image dans R2
async function saveImageToR2(imageUrl: string, projectName: string, isToken: boolean, isThumbnail: boolean, env: Env): Promise<string> {
    try {
        // Nettoyer le nom du projet pour le chemin
        const cleanProjectName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        // Construire le chemin du fichier
        let fileName;
        if (isToken) {
            fileName = `${cleanProjectName}_token.png`;
        } else if (isThumbnail) {
            fileName = `${cleanProjectName}_thumbnail.png`;
        } else {
            fileName = `${cleanProjectName}_logo.png`;
        }
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

// Fonction pour obtenir les dimensions de l'image
async function getImageDimensions(imageUrl: string): Promise<{ width: number; height: number }> {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        // Vérifier si c'est un PNG
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
            const width = buffer[16] * 256 * 256 * 256 + buffer[17] * 256 * 256 + buffer[18] * 256 + buffer[19];
            const height = buffer[20] * 256 * 256 * 256 + buffer[21] * 256 * 256 + buffer[22] * 256 + buffer[23];
            return { width, height };
        }
        // Vérifier si c'est un JPEG
        else if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
            let pos = 2;
            while (pos < buffer.length) {
                if (buffer[pos] !== 0xFF) break;
                if (buffer[pos + 1] === 0xC0 || buffer[pos + 1] === 0xC2) {
                    const height = buffer[pos + 5] * 256 + buffer[pos + 6];
                    const width = buffer[pos + 7] * 256 + buffer[pos + 8];
                    return { width, height };
                }
                pos += 2 + buffer[pos + 2] * 256 + buffer[pos + 3];
            }
        }
        throw new Error('Unsupported image format. Please use PNG or JPEG.');
    } catch (error) {
        console.error('Error getting image dimensions:', error);
        throw new Error('Could not determine image dimensions');
    }
}

// Fonction pour redimensionner l'image via un service d'URL avec des contraintes spécifiques
async function resizeImageWithService(imageUrl: string, width: number, height: number, isThumbnail: boolean, isSquare: boolean): Promise<ArrayBuffer> {
    try {
        // Utiliser images.weserv.nl, un service de transformation d'images
        const serviceUrl = new URL('https://images.weserv.nl/');
        
        // Ajouter l'URL de l'image source
        serviceUrl.searchParams.append('url', imageUrl);
        
        // Ajouter les paramètres de redimensionnement
        if (isThumbnail) {
            // Pour les thumbnails, on veut respecter le ratio 600x330
            serviceUrl.searchParams.append('w', width.toString());
            serviceUrl.searchParams.append('h', height.toString());
            serviceUrl.searchParams.append('fit', 'cover'); // Recadrer pour remplir exactement les dimensions
            serviceUrl.searchParams.append('a', 'center'); // Centrer le recadrage
        } else if (isSquare) {
            // Pour les logos et tokens, on veut des images carrées
            serviceUrl.searchParams.append('w', width.toString());
            serviceUrl.searchParams.append('h', height.toString());
            serviceUrl.searchParams.append('fit', 'cover'); // Recadrer pour obtenir un carré
            serviceUrl.searchParams.append('a', 'center'); // Centrer le recadrage
        } else {
            // Fallback (ne devrait pas être utilisé)
            serviceUrl.searchParams.append('w', width.toString());
            serviceUrl.searchParams.append('h', height.toString());
            serviceUrl.searchParams.append('fit', 'inside');
        }
        
        // Ajouter des paramètres de qualité
        serviceUrl.searchParams.append('q', '90');
        serviceUrl.searchParams.append('output', 'jpg');
        
        console.log('Resizing image with service:', serviceUrl.toString());
        
        // Récupérer l'image redimensionnée
        const response = await fetch(serviceUrl.toString());
        if (!response.ok) {
            throw new Error(`Failed to resize image: ${response.status} ${response.statusText}`);
        }
        
        return await response.arrayBuffer();
    } catch (error) {
        console.error('Error resizing image with service:', error);
        throw error;
    }
}

// Modifier la fonction handleImage pour utiliser le service de redimensionnement avec contraintes
async function handleImage(ctx: MyContext, env: Env, fileUrl: string, isToken: boolean, isThumbnail: boolean) {
    try {
        console.log('Processing image:', fileUrl);
        console.log('Image type:', isToken ? 'token' : isThumbnail ? 'thumbnail' : 'logo');

        // Vérifier la taille du fichier
        const response = await fetch(fileUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        const contentLength = parseInt(response.headers.get('content-length') || '0');
        console.log('Content length:', contentLength);

        const maxSize = 1024 * 1024; // 1 MB
        if (contentLength > maxSize) {
            await ctx.reply("File too large! Please send an image smaller than 1MB 🚫");
            return;
        }

        // Vérifier les dimensions
        const dimensions = await getImageDimensions(fileUrl);
        console.log('Image dimensions:', dimensions);

        // Vérifications des dimensions
        if (!isToken && !isThumbnail) {
            // Pour les logos, taille minimale de 120x120
            if (dimensions.width < 120 || dimensions.height < 120) {
                await ctx.reply(`Logo size is ${dimensions.width}x${dimensions.height} pixels. Logo must be at least 120x120 pixels! Optimal size is 200x200 pixels. 🎨`);
                return;
            }
        } else if (isThumbnail) {
            // Pour les thumbnails, dimensions minimales de 400x220
            if (dimensions.width < 400 || dimensions.height < 220) {
                await ctx.reply(`Thumbnail size is ${dimensions.width}x${dimensions.height} pixels. Thumbnail must be at least 400x220 pixels! Optimal size is 600x330 pixels. 🖼️`);
                return;
            }
        } else if (isToken) {
            // Pour les tokens, taille minimale de 24x24
            if (dimensions.width < 24 || dimensions.height < 24) {
                await ctx.reply(`Token size is ${dimensions.width}x${dimensions.height} pixels. Token image must be at least 24x24 pixels! Optimal size is 80x80 pixels. 🎯`);
                return;
            }
        }

        let finalImageUrl = '';
        let processedSuccessfully = false;

        try {
            // Essayer d'abord avec Cloudflare Images
            const processedImageUrl = await processImage(fileUrl, isToken, isThumbnail, env);
            finalImageUrl = processedImageUrl;
            processedSuccessfully = true;
            
            // Stocker l'URL de l'image traitée
            if (isToken) {
                ctx.session.answers.tokenPicture = processedImageUrl;
            } else if (isThumbnail) {
                ctx.session.answers.thumbnailPicture = processedImageUrl;
            } else {
                ctx.session.answers.projectPicture = processedImageUrl;
            }
            
            // Envoyer un message avec l'image modifiée
            await ctx.replyWithPhoto(processedImageUrl, {
                caption: `✅ Image successfully processed and resized!\n\n${isToken ? 'Token' : isThumbnail ? 'Thumbnail' : 'Logo'} image has been saved.`
            });
        } catch (cloudflareError) {
            console.error('Cloudflare Images error:', cloudflareError);
            
            // En cas d'échec, utiliser le service de redimensionnement alternatif
            console.log('Falling back to alternative resize service');
            
            try {
                // Déterminer les dimensions cibles
                let targetWidth, targetHeight;
                
                if (isToken) {
                    targetWidth = 80;
                    targetHeight = 80;
                } else if (isThumbnail) {
                    targetWidth = 600;
                    targetHeight = 330;
                } else {
                    targetWidth = 200;
                    targetHeight = 200;
                }
                
                // Redimensionner l'image
                const resizedImageBuffer = await resizeImageWithService(fileUrl, targetWidth, targetHeight, isThumbnail, !isThumbnail);
                
                // Sauvegarder l'image redimensionnée dans R2
                const cleanProjectName = (ctx.session.answers.projectName || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '-');
                
                let fileName;
                if (isToken) {
                    fileName = `${cleanProjectName}_token_${targetWidth}x${targetHeight}.jpg`;
                } else if (isThumbnail) {
                    fileName = `${cleanProjectName}_thumbnail_${targetWidth}x${targetHeight}.jpg`;
                } else {
                    fileName = `${cleanProjectName}_logo_${targetWidth}x${targetHeight}.jpg`;
                }
                
                const filePath = `images/${cleanProjectName}/${fileName}`;
                
                await env.BUCKET.put(filePath, resizedImageBuffer, {
                    httpMetadata: {
                        contentType: 'image/jpeg'
                    }
                });
                
                finalImageUrl = `https://${env.BUCKET_URL}/${filePath}`;
                processedSuccessfully = true;
                
                // Stocker l'URL de l'image
                if (isToken) {
                    ctx.session.answers.tokenPicture = finalImageUrl;
                } else if (isThumbnail) {
                    ctx.session.answers.thumbnailPicture = finalImageUrl;
                } else {
                    ctx.session.answers.projectPicture = finalImageUrl;
                }
                
                // Envoyer un message avec l'image redimensionnée
                await ctx.replyWithPhoto(finalImageUrl, {
                    caption: `✅ Image successfully resized with alternative service!\n\n${isToken ? 'Token' : isThumbnail ? 'Thumbnail' : 'Logo'} image has been saved.`
                });
            } catch (resizeError) {
                console.error('Alternative resize service error:', resizeError);
                
                // En dernier recours, utiliser l'image originale
                const imageBuffer = await response.arrayBuffer();
                
                // Sauvegarder l'image dans R2
                const cleanProjectName = (ctx.session.answers.projectName || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '-');
                
                let fileName;
                if (isToken) {
                    fileName = `${cleanProjectName}_token_original.jpg`;
                } else if (isThumbnail) {
                    fileName = `${cleanProjectName}_thumbnail_original.jpg`;
                } else {
                    fileName = `${cleanProjectName}_logo_original.jpg`;
                }
                
                const filePath = `images/${cleanProjectName}/${fileName}`;
                
                await env.BUCKET.put(filePath, imageBuffer, {
                    httpMetadata: {
                        contentType: 'image/jpeg'
                    }
                });
                
                finalImageUrl = `https://${env.BUCKET_URL}/${filePath}`;
                console.log('Original image saved to R2:', finalImageUrl);
                
                // Stocker l'URL de l'image
                if (isToken) {
                    ctx.session.answers.tokenPicture = finalImageUrl;
                } else if (isThumbnail) {
                    ctx.session.answers.thumbnailPicture = finalImageUrl;
                } else {
                    ctx.session.answers.projectPicture = finalImageUrl;
                }
                
                // Envoyer un message avec l'image originale
                await ctx.replyWithPhoto(finalImageUrl, {
                    caption: `⚠️ Image saved but not resized (using original dimensions).\n\n${isToken ? 'Token' : isThumbnail ? 'Thumbnail' : 'Logo'} image has been saved.`
                });
            }
        }

        // Informer l'utilisateur du résultat
        if (!processedSuccessfully) {
            await ctx.reply(`Note: The image could not be processed by our resizing services, so we've saved the original. It will work, but for optimal display, consider manually resizing your image to ${isToken ? '80x80' : isThumbnail ? '600x330' : '200x200'} pixels.`);
        }

        ctx.session.answers.currentQuestion++;
        await askNextQuestion(ctx, env);
    } catch (error) {
        console.error('Detailed error in handleImage:', error);
        if (error instanceof Error) {
            await ctx.reply(`Error processing image: ${error.message}`);
        } else {
            await ctx.reply("Error processing image. Please make sure you're sending a valid JPG or PNG file and try again.");
        }
    }
}

// Nouvelle fonction pour sauvegarder un buffer dans R2
async function saveImageToR2WithBuffer(
    imageBuffer: ArrayBuffer,
    projectName: string,
    isToken: boolean,
    isThumbnail: boolean,
    env: Env
): Promise<string> {
    try {
        const cleanProjectName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        let fileName;
        if (isToken) {
            fileName = `${cleanProjectName}_token.png`;
        } else if (isThumbnail) {
            fileName = `${cleanProjectName}_thumbnail.png`;
        } else {
            fileName = `${cleanProjectName}_logo.png`;
        }
        const filePath = `images/${cleanProjectName}/${fileName}`;

        await env.BUCKET.put(filePath, imageBuffer, {
            httpMetadata: {
                contentType: 'image/png'
            }
        });

        return `https://${env.BUCKET_URL}/${filePath}`;
    } catch (error) {
        console.error('Error saving image to R2:', error);
        throw error;
    }
}

// Mettre à jour la fonction processImage pour avoir des contraintes spécifiques
async function processImage(imageUrl: string, isToken: boolean, isThumbnail: boolean, env: Env): Promise<string> {
    try {
        // Télécharger l'image depuis l'URL
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        
        const imageBlob = await response.blob();
        
        // Créer un FormData pour l'upload
        const formData = new FormData();
        formData.append('file', imageBlob);
        
        // Déterminer les options de transformation
        let transformations = '';
        if (!isToken && !isThumbnail) {
            // Logo: exactement 200x200 (carré)
            transformations = 'fit=cover,width=200,height=200';
        } else if (isThumbnail) {
            // Thumbnail: exactement 600x330
            transformations = 'fit=cover,width=600,height=330';
        } else if (isToken) {
            // Token: exactement 80x80 (carré)
            transformations = 'fit=cover,width=80,height=80';
        }
        
        // Ajouter les métadonnées
        formData.append('metadata', JSON.stringify({
            transformations: transformations
        }));
        
        console.log('Uploading to Cloudflare Images with account ID:', env.CF_ACCOUNT_ID);
        
        // Uploader vers Cloudflare Images
        const uploadResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.CF_API_TOKEN}`
            },
            body: formData
        });
        
        const responseText = await uploadResponse.text();
        console.log('Cloudflare Images response:', responseText);
        
        if (!uploadResponse.ok) {
            let errorData;
            try {
                errorData = JSON.parse(responseText);
            } catch (e) {
                errorData = { error: responseText };
            }
            throw new Error(`Failed to upload to Cloudflare Images: ${JSON.stringify(errorData)}`);
        }
        
        const uploadResult = JSON.parse(responseText);
        
        if (!uploadResult.success) {
            throw new Error(`Upload failed: ${JSON.stringify(uploadResult)}`);
        }
        
        // Retourner l'URL de l'image transformée
        return `${uploadResult.result.variants[0]}`;
    } catch (error) {
        console.error('Error processing image with Cloudflare Images:', error);
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
        await bot.init();

        bot.command("getGroupId", async (ctx) => {
            const chatId = ctx.chat?.id;
            const chatType = ctx.chat?.type;
            const chatTitle = ctx.chat?.title;
            const messageThreadId = ctx.message?.message_thread_id;
            const fromChat = ctx.message?.chat;
            
            console.log('Chat details:', {
                id: chatId,
                type: chatType,
                title: chatTitle,
                messageThreadId: messageThreadId,
                fromChat: fromChat,
                fullMessage: ctx.message
            });
            
            try {
                // Essayer d'envoyer dans le chat d'origine
                await ctx.api.sendMessage(chatId, `
Debug Chat Info:
ID: ${chatId}
Type: ${chatType}
Title: ${chatTitle}
Thread ID: ${messageThreadId}
From Chat: ${JSON.stringify(fromChat, null, 2)}
                `);
            } catch (error) {
                console.error('Error sending message:', error);
                // Si échec, essayer d'envoyer dans le chat général
                await ctx.reply(`Error sending to original chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });

        bot.command("ping", async (ctx) => {
            await ctx.reply("Pong!");
        });

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
                                fdvMin: '',
                                fdvMax: '',
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
                    fdvMin: '',
                    fdvMax: '',
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
                                fdvMin: '',
                                fdvMax: '',
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

                    // Envoyer les images d'exemple en utilisant des URLs
                    await ctx.replyWithPhoto("https://pub-0cbbb3349b8a4e4384de7e35e44350eb.r2.dev/screenshots/screen1.png");
                    await ctx.replyWithPhoto("https://pub-0cbbb3349b8a4e4384de7e35e44350eb.r2.dev/screenshots/screen2.png");

                    await ctx.reply(`GM @${username}! 👋\n\nI'll guide you through creating your page in the Draft Pick section on BorgPad. You'll find attached photos showing where all the information will be displayed. Shall we begin?`);
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
            if (currentQuestion === 2 || currentQuestion === 3 || currentQuestion === 13) {
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
                if (ctx.message.photo && (currentQuestion === 2 || currentQuestion === 3 || currentQuestion === 13)) {
                    const photo = ctx.message.photo[0]; // Utiliser la première version (non compressée)
                    const file = await ctx.api.getFile(photo.file_id);
                    
                    if (!file.file_path) {
                        await ctx.reply("Error: Couldn't get the file path. Please try sending the image as a file.");
                        shouldMoveToNextQuestion = false;
                        return;
                    }

                    const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
                    
                    // Sauvegarder l'image dans R2
                    await handleImage(ctx, env, fileUrl, currentQuestion === 13, currentQuestion === 3);
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
                        case 10: answers.fdvMin = ctx.message.text; break;
                        case 11: answers.fdvMax = ctx.message.text; break;
                        case 12: 
                        if (!ctx.message.text.startsWith('$') || ctx.message.text.length > 6) {
                            await ctx.reply("Invalid ticker format. Must start with '$' and be up to 5 characters long in uppercase. 💔");
                            shouldMoveToNextQuestion = false;
                            return;
                        }
                        answers.ticker = ctx.message.text;
                        break;
                        case 14:
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
            
            if (currentQuestion === 2 || currentQuestion === 3 || currentQuestion === 13) {
                const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Meilleure qualité disponible
                const file = await ctx.api.getFile(photo.file_id);
                
                if (!file.file_path) {
                    await ctx.reply("Error: Couldn't get the file path. Please try again.");
                    return;
                }

                const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
                await handleImage(ctx, env, fileUrl, currentQuestion === 13, currentQuestion === 3);
            }
        });

        // Gestionnaire pour les documents (non compressés)
        bot.on("message:document", async (ctx) => {
            const currentQuestion = ctx.session.answers.currentQuestion;
            
            if (currentQuestion === 2 || currentQuestion === 3 || currentQuestion === 13) {
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
                await handleImage(ctx, env, fileUrl, currentQuestion === 13, currentQuestion === 3);
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
        bot.on("callback_query:data", async (ctx) => {
            const data = ctx.callbackQuery.data;
            const answers = ctx.session.answers;
            
            console.log('Callback data received:', data);

            // Gérer les différents boutons
            if (data?.startsWith("chain_")) {
                answers.chain = data.replace("chain_", "");
                await ctx.reply(`Chain selected: ${answers.chain} ✅`);
                
                // Passer à la question suivante
                answers.currentQuestion++;
                await askNextQuestion(ctx, env);
            }
            else if (data?.startsWith("tge_")) {
                answers.tgeDate = data.replace("tge_", "");
                await ctx.reply(`TGE date selected: ${answers.tgeDate} ✅`);
                
                // Passer à la question suivante
                answers.currentQuestion++;
                await askNextQuestion(ctx, env);
            }
            else if (data?.startsWith("fdvMin_")) {
                const minValue = data.replace("fdvMin_", "");
                answers.fdvMin = minValue;
                await ctx.reply(`FDV Min set to: $${minValue}M ✅`);
                
                // Passer à la question suivante
                answers.currentQuestion++;
                await askNextQuestion(ctx, env);
            }
            else if (data?.startsWith("fdvMax_")) {
                const maxValue = data.replace("fdvMax_", "");
                answers.fdvMax = maxValue;
                
                // Mettre à jour le champ fdv avec la fourchette complète
                const min = answers.fdvMin || "1";
                answers.fdv = `$${min}M - $${maxValue}M`;
                
                await ctx.reply(`FDV Max set to: $${maxValue}M ✅\nFDV Range: ${answers.fdv}`);
                
                // Passer à la question suivante
                answers.currentQuestion++;
                await askNextQuestion(ctx, env);
            }

            // Confirmer la sélection
            await ctx.answerCallbackQuery();
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
