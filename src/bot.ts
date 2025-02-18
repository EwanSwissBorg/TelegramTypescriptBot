import { Bot } from "grammy";
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

// Vérifier que le token existe
const token = process.env.BOT_TOKEN;
if (!token) {
    throw new Error('BOT_TOKEN must be provided!');
}

// Créer une instance du bot
const bot = new Bot(token);

// Gérer la commande /start
bot.command("start", async (ctx) => {
    await ctx.reply("Bonjour! Je suis votre bot Telegram. Comment puis-je vous aider?");
});

// Répondre à tous les messages texte
bot.on("message:text", async (ctx) => {
    if (!ctx.message.text.startsWith('/')) {
        await ctx.reply(`Vous avez dit: ${ctx.message.text}`);
    }
});

// Démarrer le bot
bot.start();

console.log('Bot is running...');
