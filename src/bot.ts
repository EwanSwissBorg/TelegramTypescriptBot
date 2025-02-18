import { Bot, Context, session, SessionFlavor } from "grammy";
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

// Interface pour stocker les réponses
interface UserAnswers {
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
}

// Type pour le contexte avec session
type MyContext = Context & SessionFlavor<SessionData>;

// Questions array
const questions = [
    "1/13 - What is your project name? 🏷️",
    "2/13 - One sentence to describe your project 💎",
    "3/13 - Send your project picture in jpg or png format 🖼️ (WITHOUT COMPRESSION)",
    "4/13 - Your website Link 🌐",
    "5/13 - Your telegram OR discord link (your main channel to communicate your community) 💬",
    "6/13 - Your X link 🐦",
    "7/13 - On which chain you want to deploy? ⛓️",
    "8/13 - What is your sector? 🎯 (Depin / SocialFi / DeFi etc.)",
    "9/13 - When do you plan to do your TGE? 📅",
    "10/13 - Which FDV do you want ? 💰",
    "11/13 - Your token TICKER $XXXXX 🎫 (must start with '$' and be up to 5 characters long in uppercase).",
    "12/13 - Send your token picture in jpg or png format 🖼️ (WITHOUT COMPRESSION)",
    "13/13 - To provide the most information to your investors - and make them want to invest - you need a data room 📚\n\nExamples:\nAmbient: https://borgpad-data-room.notion.site/moemate?pvs=4\nSolana ID: https://www.solana.id/solid\n\nHere is a template: https://docs.google.com/document/d/1j3hxzO8_9wNfWfVxGNRDLFV8TJectQpX4bY6pSxCLGs/edit?tab=t.0\n\nShare the link of your data room 📝"
];

// Vérifier que le token existe
const token = process.env.BOT_TOKEN;
if (!token) {
    throw new Error('BOT_TOKEN must be provided!');
}

// Créer une instance du bot
const bot = new Bot<MyContext>(token);

// Configurer la session
bot.use(session({
    initial: (): SessionData => ({
        answers: {
            currentQuestion: 0
        }
    })
}));

// Fonction pour afficher le résumé
async function showSummary(ctx: MyContext) {
    const answers = ctx.session.answers;
    const summary = `
📋 Project Summary:

Project Name: ${answers.projectName}
Description: ${answers.description}
Website: ${answers.websiteLink}
Community Link: ${answers.communityLink}
X Link: ${answers.xLink}
Chain: ${answers.chain}
Sector: ${answers.sector}
TGE Date: ${answers.tgeDate}
FDV: ${answers.fdv}
Token Ticker: ${answers.ticker}
Data Room: ${answers.dataRoom}

Thank you for providing all the information! 🎉
`;
    await ctx.reply(summary);
}

// Fonction pour poser la prochaine question
async function askNextQuestion(ctx: MyContext) {
    const currentQuestion = ctx.session.answers.currentQuestion;
    if (currentQuestion < questions.length) {
        await ctx.reply(questions[currentQuestion]);
    } else {
        await showSummary(ctx);
    }
}

// Gérer la commande /start
bot.command("start", async (ctx) => {
    const userName = ctx.from?.first_name || "there";
    await ctx.reply(`Welcome ${userName}! 👋\n\nI'm the BorgPad Curator Bot. I'll help you to create your commitment page on BorgPad.`);
    ctx.session.answers = { currentQuestion: 0 };
    await askNextQuestion(ctx);
});

// Gérer les messages texte et photos
bot.on(["message:text", "message:photo"], async (ctx) => {
    if (ctx.session.answers.currentQuestion >= questions.length) return;

    const answers = ctx.session.answers;
    const currentQuestion = answers.currentQuestion;

    // Gérer les réponses selon la question
    if (ctx.message.photo && (currentQuestion === 2 || currentQuestion === 11)) {
        // Stocker l'ID de la photo pour les questions 3 et 12
        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        if (currentQuestion === 2) answers.projectPicture = photoId;
        else answers.tokenPicture = photoId;
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
                    await ctx.reply("Invalid ticker format. Must start with '$' and be up to 5 characters long in uppercase.");
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
