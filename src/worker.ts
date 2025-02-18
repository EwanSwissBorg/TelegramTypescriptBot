import { Bot, webhookCallback, Context, session, SessionFlavor, InlineKeyboard } from "grammy";
import { getTwitterAuthLink, validateTwitterAuth } from './twitter-auth';
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
                return Response.json({ error: 'Missing parameters' }, { status: 400 });
            }

            const redirectUrl = `https://t.me/typescriptewanbot?start=twitter_callback_${code}_${state}`;
            return Response.redirect(redirectUrl, 302);
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
            const userName = ctx.from?.first_name || "there";
            await ctx.reply(`Welcome ${userName}! 👋\n\nI'm the BorgPad Curator Bot. Let's start with some questions about your project.`);
            await askNextQuestion(ctx);
        });

        // Gestionnaire de messages
        bot.on(["message:text", "message:photo"], async (ctx) => {
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
