require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const User = require('./models/User');
const Movie = require('./models/Movie');
const Channel = require('./models/Channel');
const JoinRequest = require('./models/JoinRequest');
const Setting = require('./models/Setting');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// 1. Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDBga muvaffaqiyatli ulanindi'))
    .catch(err => {
        console.error('MongoDBga ulanishda xato:', err);
        process.exit(1);
    });

// 2. Health Check Server for Render
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000, () => {
    console.log(`Server ${process.env.PORT || 3000}-portda ishlamoqda`);
});

// 3. Middlewares
const checkSubscription = async (ctx, next) => {
    try {
        if (ctx.from.id === ADMIN_ID) return next();

        const channels = await Channel.find();
        if (channels.length === 0) return next();

        const unsubscribed = [];
        for (const channel of channels) {
            try {
                if (channel.type === 'external') continue; 
                
                const member = await ctx.telegram.getChatMember(channel.chatId, ctx.from.id);
                const isMember = ['member', 'administrator', 'creator', 'restricted'].includes(member.status);
                
                if (!isMember) {
                    // Check if they have a pending join request
                    const pending = await JoinRequest.findOne({ userId: ctx.from.id, chatId: channel.chatId });
                    if (!pending) {
                        unsubscribed.push(channel);
                    }
                }
            } catch (error) {
                console.error(`Kanal tekshirishda xato (${channel.chatId}):`, error.message);
            }
        }

        if (unsubscribed.length > 0) {
            const buttons = unsubscribed.map(ch => Markup.button.url(ch.name || 'Kanalga obuna bo\'lish', ch.inviteLink));
            buttons.push(Markup.button.callback('✅ Tekshirish', 'check_sub'));
            
            return ctx.reply('Botdan foydalanish uchun quyidagi kanallarga obuna bo\'ling:', 
                Markup.inlineKeyboard(buttons, { columns: 1 }));
        }

        return next();
    } catch (e) {
        console.error('Subscription check middleware error:', e);
        return next();
    }
};

// 4. Admin Helpers
const getStats = async () => {
    const total = await User.countDocuments();
    const active = await User.countDocuments({ status: 'active' });
    const blocked = await User.countDocuments({ status: 'blocked' });
    
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const last3Days = await User.countDocuments({ joinedAt: { $gte: threeDaysAgo } });

    return `📊 *Statistika:*\n\n` +
           `👤 Jami foydalanuvchilar: ${total}\n` +
           `✅ Faol: ${active}\n` +
           `🚫 Bloklangan: ${blocked}\n` +
           `📅 Oxirgi 3 kunda qo'shilgan: ${last3Days}`;
};

const parseButtons = (text) => {
    if (!text || text === 'Yo\'q') return null;
    const lines = text.split('\n');
    const buttons = [];
    lines.forEach(line => {
        const [name, link] = line.split('|').map(s => s.trim());
        if (name && link && link.startsWith('http')) {
            buttons.push(Markup.button.url(name, link));
        }
    });
    return buttons.length > 0 ? Markup.inlineKeyboard(buttons, { columns: 1 }) : null;
};

// 5. Bot Commands/Events
bot.start(async (ctx) => {
    const { id, first_name, username } = ctx.from;
    try {
        await User.findOneAndUpdate(
            { telegramId: id },
            { username, status: 'active' },
            { upsert: true, returnDocument: 'after' }
        );
        ctx.reply(`Salom ${first_name}! Kino kodini yuboring.`);
    } catch (e) {
        console.error('Start error:', e);
    }
});

// Handle Chat Join Request (Track "zayafkas")
bot.on('chat_join_request', async (ctx) => {
    try {
        const { from, chat } = ctx.chatJoinRequest;
        await JoinRequest.findOneAndUpdate(
            { userId: from.id, chatId: chat.id.toString() },
            { requestedAt: new Date() },
            { upsert: true }
        );
        console.log(`Join request recorded for User: ${from.id} in Chat: ${chat.id}`);
    } catch (e) {
        console.error('Chat Join Request recording error:', e);
    }
});

bot.action('check_sub', async (ctx) => {
    try {
        const channels = await Channel.find();
        const unsubscribed = [];
        for (const channel of channels) {
            try {
                if (channel.type === 'external') continue;
                const member = await ctx.telegram.getChatMember(channel.chatId, ctx.from.id);
                const isMember = ['member', 'administrator', 'creator', 'restricted'].includes(member.status);
                
                if (!isMember) {
                    const pending = await JoinRequest.findOne({ userId: ctx.from.id, chatId: channel.chatId });
                    if (!pending) unsubscribed.push(channel);
                }
            } catch (e) {}
        }

        if (unsubscribed.length === 0) {
            await ctx.answerCbQuery('Rahmat! Endi botdan foydalanishingiz mumkin.');
            await ctx.editMessageText('Obuna tasdiqlandi. Kino kodini yuboring.');
        } else {
            await ctx.answerCbQuery('Hali barcha kanallarga obuna bo\'lmagansiz!', { show_alert: true });
        }
    } catch (e) {
        console.error('Action check_sub error:', e);
    }
});

// Admin Panel
bot.command('admin', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    ctx.reply('Admin paneliga xush kelibsiz:', Markup.keyboard([
        ['📊 Statistika', '📢 Xabar yuborish'],
        ['🎬 Kino qo\'shish', '🎬 Kino tahrirlash'],
        ['📢 Kanal sozalamalari', '📽 Kino kanal linki'],
        ['🏠 Asosiy menyu']
    ]).resize());
});

bot.hears('📊 Statistika', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const stats = await getStats();
    ctx.replyWithMarkdown(stats);
});

bot.hears('🎬 Kino qo\'shish', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ctx.from.id] = { step: 'waiting_movie' };
    ctx.reply('Kino faylini (yoki videoni) yuboring:');
});

bot.hears('🎬 Kino tahrirlash', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ctx.from.id] = { step: 'waiting_edit_code' };
    ctx.reply('Tahrirlamoqchi bo\'lgan kino kodini yuboring:');
});

bot.hears('📢 Kanal sozalamalari', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply('Kanal boshqaruvi:', Markup.inlineKeyboard([
        [Markup.button.callback('➕ Kanal qo\'shish', 'add_channel')],
        [Markup.button.callback('❌ Kanalni o\'chirish', 'del_channel')]
    ]));
});

bot.hears('📽 Kino kanal linki', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ctx.from.id] = { step: 'waiting_setting_link' };
    ctx.reply('Barcha kino kodlari jamlangan kanal linkini yuboring (https://...):');
});

bot.hears('📢 Xabar yuborish', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ctx.from.id] = { step: 'waiting_broadcast' };
    ctx.reply('Foydalanuvchilarga yubormoqchi bo\'lgan xabaringizni yozing:');
});

bot.hears('🏠 Asosiy menyu', (ctx) => {
    ctx.reply('Asosiy menyuga qaytdingiz.', Markup.removeKeyboard());
});

// Admin Callbacks
bot.action('add_channel', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    adminState[ctx.from.id] = { step: 'adding_channel_id' };
    ctx.reply('Kanal ID sini yuboring (masalan: @kanal_yoki_id yoki -100...):');
});

bot.action('del_channel', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const channels = await Channel.find();
    if (channels.length === 0) return ctx.reply('Ulangan kanallar yo\'q.');
    const buttons = channels.map(ch => [Markup.button.callback(`❌ ${ch.chatId}`, `del_${ch._id}`)]);
    ctx.reply('O\'chirmoqchi bo\'lgan kanalingizni tanlang:', Markup.inlineKeyboard(buttons));
});

bot.action(/^del_(.+)$/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    try {
        await Channel.findByIdAndDelete(ctx.match[1]);
        ctx.answerCbQuery('Kanal o\'chirildi');
        ctx.editMessageText('Kanal muvaffaqiyatli olib tashlandi.');
    } catch (e) {
        ctx.answerCbQuery('Xatolik yuz berdi');
    }
});

// Centralized State & Message Handler
let adminState = {};

bot.on('message', async (ctx, next) => {
    const userId = ctx.from.id;
    const state = adminState[userId];

    if (userId === ADMIN_ID && state) {
        // 1. Channel Adding Flow
        if (state.step === 'adding_channel_id') {
            state.chatId = ctx.message.text;
            state.step = 'adding_channel_link';
            return ctx.reply('Kanal linkini yuboring (https://...):');
        }
        if (state.step === 'adding_channel_link') {
            state.inviteLink = ctx.message.text;
            state.step = 'adding_channel_name';
            return ctx.reply('Kanal xabarda ko\'rinadigan nomini yuboring:');
        }
        if (state.step === 'adding_channel_name') {
            try {
                await new Channel({ 
                    chatId: state.chatId, 
                    inviteLink: state.inviteLink, 
                    name: ctx.message.text 
                }).save();
                delete adminState[userId];
                return ctx.reply('✅ Kanal muvaffaqiyatli qo\'shildi!');
            } catch (e) {
                return ctx.reply('❌ Kanalni saqlashda xato yuz berdi.');
            }
        }

        // 2. Movie Adding Flow
        if (state.step === 'waiting_movie' && (ctx.message.video || ctx.message.document || ctx.message.photo)) {
            let fileId;
            if (ctx.message.video) fileId = ctx.message.video.file_id;
            else if (ctx.message.document) fileId = ctx.message.document.file_id;
            else fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

            state.fileId = fileId;
            state.caption = ctx.message.caption || '';
            state.step = 'waiting_code';
            return ctx.reply('Endi ushbu kino uchun kod kiriting:');
        }
        if (state.step === 'waiting_code' && ctx.message.text) {
            const code = ctx.message.text;
            try {
                await new Movie({ code, fileId: state.fileId, caption: state.caption }).save();
                delete adminState[userId];
                return ctx.reply(`✅ Muvaffaqiyatli saqlandi! Kod: ${code}`);
            } catch (e) {
                return ctx.reply('❌ Bu kod band yoki xato yuz berdi.');
            }
        }

        // 3. Movie Editing Flow
        if (state.step === 'waiting_edit_code' && ctx.message.text) {
            const movie = await Movie.findOne({ code: ctx.message.text });
            if (!movie) return ctx.reply('❌ Bunday kodli kino topilmadi.');
            state.editCode = ctx.message.text;
            state.step = 'waiting_new_file';
            return ctx.reply('Endi yangi kino faylini (video/dokumment) yuboring:');
        }
        if (state.step === 'waiting_new_file' && (ctx.message.video || ctx.message.document || ctx.message.photo)) {
            let fileId;
            if (ctx.message.video) fileId = ctx.message.video.file_id;
            else if (ctx.message.document) fileId = ctx.message.document.file_id;
            else fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

            await Movie.updateOne({ code: state.editCode }, { fileId, caption: ctx.message.caption || '' });
            delete adminState[userId];
            return ctx.reply('✅ Kino muvaffaqiyatli yangilandi!');
        }

        // 4. Setting Link Flow
        if (state.step === 'waiting_setting_link' && ctx.message.text) {
            await Setting.findOneAndUpdate(
                { key: 'movieChannelLink' },
                { value: ctx.message.text },
                { upsert: true }
            );
            delete adminState[userId];
            return ctx.reply('✅ Kino kanal linki muvaffaqiyatli saqlandi!');
        }

        // 5. Broadcast Flow
        if (state.step === 'waiting_broadcast') {
            state.broadcastMsg = ctx.message;
            state.step = 'asking_buttons';
            return ctx.reply('Xabarga tugmalar qo\'shilsinmi?\nFormat: `Nomi | Link` (Har bir tugma yangi qatordan)\nAgarda tugma kerak bo\'lmasa "Yo\'q" deb yozing.', { parse_mode: 'Markdown' });
        }
        if (state.step === 'asking_buttons' && ctx.message.text) {
            const keyboard = parseButtons(ctx.message.text);
            const users = await User.find();
            ctx.reply(`🚀 Tarqatish boshlandi... Jami: ${users.length} foydalanuvchi.`);

            let sent = 0, blocked = 0;
            for (const user of users) {
                try {
                    await ctx.telegram.copyMessage(user.telegramId, ctx.from.id, state.broadcastMsg.message_id, keyboard);
                    sent++;
                } catch (e) {
                    blocked++;
                    await User.updateOne({ telegramId: user.telegramId }, { status: 'blocked' });
                }
                await new Promise(r => setTimeout(r, 50)); 
            }
            delete adminState[userId];
            return ctx.reply(`✅ Tayyor!\n📤 Yuborildi: ${sent}\n🚫 Bloklanganlar: ${blocked}`);
        }
    }

    return next();
}, checkSubscription, async (ctx) => {
    if (ctx.message && ctx.message.text) {
        const text = ctx.message.text;
        if (text.startsWith('/')) return;

        const movie = await Movie.findOne({ code: text });
        if (movie) {
            try {
                await ctx.replyWithVideo(movie.fileId, { caption: movie.caption });
            } catch (e) {
                try { await ctx.replyWithDocument(movie.fileId, { caption: movie.caption }); }
                catch (e2) { await ctx.reply('Kino faylini yuborishda xato yuz berdi.'); }
            }
        } else {
            const setting = await Setting.findOne({ key: 'movieChannelLink' });
            const link = setting ? setting.value : 'Hozircha link yo\'q';
            ctx.reply(`❌ Kino topilmadi.\n\n🎥 Bizning barcha kino kodlarimiz bu yerda:\n${link}`);
        }
    }
});

bot.catch((err, ctx) => {
    console.error(`Bot Error (${ctx.updateType}):`, err);
});

bot.launch().then(() => console.log('Bot muvaffaqiyatli ishga tushdi...'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
