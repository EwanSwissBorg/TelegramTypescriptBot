import { Bot, Context, session, SessionFlavor, InlineKeyboard } from "grammy";
import { getTwitterAuthLink, validateTwitterAuth } from './twitter-auth';
import dotenv from 'dotenv';
import { FileAdapter } from "@grammyjs/storage-file";
import { ProjectDatabase } from './db/database';

// Charger les variables d'environnement
dotenv.config();

// Interface pour stocker les réponses
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

// Type pour la session
interface SessionData {
    answers: UserAnswers;
    twitterAuth?: {
        codeVerifier: string;
        state: string;
    };
}

// Type pour le contexte avec session
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

// Vérifier que le token existe
const token = process.env.BOT_TOKEN;
if (!token) {
    throw new Error('BOT_TOKEN must be provided!');
}

// Créer une instance du bot
const bot = new Bot<MyContext>(token);

// Configurer la session avec stockage fichier
bot.use(session({
    initial: (): SessionData => ({
        answers: {
            currentQuestion: 0
        }
    }),
    storage: new FileAdapter({
        dirName: "sessions"
    })
}));

// Initialiser la base de données
const db = new ProjectDatabase('projects.db');

// Fonction pour afficher le résumé
async function showSummary(ctx: MyContext) {
    const answers = ctx.session.answers;
    
    // Sauvegarder dans la base de données
    try {
        await db.createProject({
            userId: ctx.from?.id.toString() || '',
            twitterUsername: answers.twitterUsername || '',
            projectName: answers.projectName || '',
            description: answers.description || '',
            projectPicture: answers.projectPicture || '',
            websiteLink: answers.websiteLink || '',
            communityLink: answers.communityLink || '',
            xLink: answers.xLink || '',
            chain: answers.chain || '',
            sector: answers.sector || '',
            tgeDate: answers.tgeDate || '',
            fdv: answers.fdv || '',
            ticker: answers.ticker || '',
            tokenPicture: answers.tokenPicture || '',
            dataRoom: answers.dataRoom || ''
        });
    } catch (error) {
        console.error('Error saving to database:', error);
    }

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

// Fonction pour poser la prochaine question
async function askNextQuestion(ctx: MyContext) {
    const currentQuestion = ctx.session.answers.currentQuestion;
    
    // Vérifier si l'utilisateur est connecté à Twitter avant de commencer les questions
    if (!ctx.session.answers.twitterConnected) {
        await ctx.reply("Please connect your X account first! 🐦");
        return;
    }

    if (currentQuestion < questions.length) {
        await ctx.reply(questions[currentQuestion]);
    } else {
        await showSummary(ctx);
    }
}

// Gérer le callback Twitter
bot.command("start", async (ctx) => {
    const fullCommand = ctx.message?.text || '';
    console.log('Full command received:', fullCommand);
    
    // Vérifier si c'est un callback Twitter réussi
    if (fullCommand.includes('twitter_success_')) {
        try {
            const username = fullCommand.split('twitter_success_')[1];
            console.log('Twitter username:', username);
            
            ctx.session.answers.twitterConnected = true;
            ctx.session.answers.twitterUsername = username;
            await ctx.reply(`Welcome @${username}! 👋\n\nI'm the BorgPad Curator Bot. I'll help you to create your commitment page on BorgPad.`);
            await askNextQuestion(ctx);
            return;
        } catch (error) {
            console.error('Error handling Twitter success:', error);
            await ctx.reply("An error occurred. Please try again.");
            return;
        }
    }

    // Si ce n'est pas un callback Twitter, c'est un démarrage normal du bot
    const userName = ctx.from?.first_name || "there";
    
    try {
        const { url, codeVerifier, state } = await getTwitterAuthLink(ctx.from?.id.toString() || '');
        
        // Stocker le code verifier dans le serveur
        const storeUrl = `${process.env.TWITTER_CALLBACK_URL?.replace('/twitter/callback', '')}/store-verifier?state=${state}&codeVerifier=${codeVerifier}`;
        await fetch(storeUrl);

        const keyboard = new InlineKeyboard()
            .url("Connect with X 🐦", url)
            .row();

        await ctx.reply(
            `Welcome ${userName}! 👋\n\nI'm the BorgPad Curator Bot. I'll help you to create your commitment page on BorgPad.\n\nFirst, please connect your X account:`,
            { reply_markup: keyboard }
        );
    } catch (error) {
        console.error('Error generating Twitter auth link:', error);
        await ctx.reply("Sorry, there was an error setting up Twitter authentication. Please try again later.");
    }
});

// Gérer les messages texte et photos
bot.on(["message:text", "message:photo"], async (ctx) => {
    if (ctx.session.answers.currentQuestion >= questions.length) return;

    const answers = ctx.session.answers;
    const currentQuestion = answers.currentQuestion;

    // Vérifier si une image est attendue
    if (currentQuestion === 2 || currentQuestion === 11) {
        if (!ctx.message.photo) {
            await ctx.reply("Please send a picture in jpg or png format with compression 🖼️");
            return;
        }
    } else if (ctx.message.photo) {
        await ctx.reply("A text response is expected for this question. Please provide text. 📝");
        return;
    }

    // Gérer les réponses selon la question
    if (ctx.message.photo && (currentQuestion === 2 || currentQuestion === 11)) {
        // Obtenir la photo dans sa plus haute qualité
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const file = await ctx.api.getFile(photo.file_id);
        
        if (!file.file_path) {
            await ctx.reply("Error: Couldn't get the file path. Please try again.");
            return;
        }

        // Vérifier le format du fichier
        if (!file.file_path.match(/\.(jpg|jpeg|png)$/i)) {
            await ctx.reply("Please send only JPG or PNG images. ❌");
            return;
        }

        // Construire l'URL complète du fichier
        const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        
        if (currentQuestion === 2) {
            answers.projectPicture = fileUrl;
            await ctx.reply("Project picture saved successfully! ✅");
        } else {
            answers.tokenPicture = fileUrl;
            await ctx.reply("Token picture saved successfully! ✅");
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
                    return;
                }
                answers.ticker = ctx.message.text;
                break;
            case 12: answers.dataRoom = ctx.message.text; break;
        }
    } else {
        await ctx.reply("Please provide a valid response.");
        return;
    }

    // Passer à la question suivante
    answers.currentQuestion++;
    await askNextQuestion(ctx);
});

// Démarrer le bot
bot.start();

console.log('Bot is running...');
