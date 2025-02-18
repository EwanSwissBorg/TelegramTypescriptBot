import { Bot, webhookCallback, Context, session, SessionFlavor, InlineKeyboard } from "grammy";
import { FileAdapter } from "@grammyjs/storage-file";
import { ExecutionContext, KVNamespace } from "@cloudflare/workers-types";

// Interfaces
interface Env {
    BOT_TOKEN: string;
    TWITTER_CLIENT_ID: string;
    TWITTER_CLIENT_SECRET: string;
    TWITTER_CALLBACK_URL: string;
    SESSION_STORE: KVNamespace;
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
    "7/13 - On which chain you want to deploy? ⛓️",
    "8/13 - What is your sector? 🎯 (Depin / SocialFi / DeFi etc.)",
    "9/13 - When do you plan to do your TGE? 📅",
    "10/13 - Which FDV do you want ? 💰",
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

// Fonction pour poser la question suivante
async function askNextQuestion(ctx: MyContext) {
    const currentQuestion = ctx.session.answers.currentQuestion;
    
    if (currentQuestion < questions.length) {
        await ctx.reply(questions[currentQuestion]);
    } else {
        await showSummary(ctx);
    }
}

// Fonction pour afficher le résumé
async function showSummary(ctx: MyContext) {
    const answers = ctx.session.answers;
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
`;
    await ctx.reply(summary);
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

            // Rediriger vers Telegram avec un paramètre simplifié
            const botUsername = 'typescriptewanbot';
            const startParam = `twitter_success`;  // Simplifié pour test
            const redirectUrl = `https://t.me/${botUsername}?start=${startParam}`;
            
            console.log('Redirecting to:', redirectUrl);
            
            // Page de redirection avec plus de feedback
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Redirecting to Telegram...</title>
                    <meta http-equiv="refresh" content="1;url=${redirectUrl}">
                </head>
                <body>
                    <h1>Authentication successful!</h1>
                    <p>Connecting your Twitter account... You will be redirected to Telegram in a moment.</p>
                    <p>If you are not redirected, <a href="${redirectUrl}">click here</a>.</p>
                    <script>
                        setTimeout(function() {
                            window.location.href = "${redirectUrl}";
                        }, 1000);
                    </script>
                </body>
                </html>
            `;

            return new Response(html, {
                headers: { 'Content-Type': 'text/html' },
            });
        }

        const bot = new Bot<MyContext>(env.BOT_TOKEN);

        // Configuration de la session simplifiée
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
            if (ctx.message?.text?.includes('twitter_success')) {
                console.log('Processing Twitter success');
                try {
                    ctx.session.answers.twitterConnected = true;
                    ctx.session.answers.twitterUsername = "user"; // Pour test
                    ctx.session.answers.currentQuestion = 0;

                    await ctx.reply(`Twitter account connected successfully! ✅\n\nLet's start with some questions about your project.`);
                    await askNextQuestion(ctx);
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
                    
                    if (currentQuestion === 2) {
                        answers.projectPicture = fileUrl;
                    } else {
                        answers.tokenPicture = fileUrl;
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
                    await askNextQuestion(ctx);
                }
            } catch (error) {
                console.error('Error processing message:', error);
                await ctx.reply("An error occurred. Please try again.");
            }
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
