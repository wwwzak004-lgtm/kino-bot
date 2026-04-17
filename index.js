require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const User = require('./models/User');
const Movie = require('./models/Movie');
const Channel = require('./models/Channel');
const JoinRequest = require('./models/JoinRequest');
const Setting = require('./models/Setting');
const Admin = require('./models/Admin');

const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = parseInt(process.env.ADMIN_ID); // Ega (Main Admin)

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

// 3. Middlewares & Helpers
const isAdmin = async (userId) => {
    if (userId === OWNER_ID) return true;
    const admin = await Admin.findOne({ telegramId: userId });
    return !!admin;
};

const checkSubscription = async (ctx, next) => {
    try {
        if (await isAdmin(ctx.from.id)) return next();

        const channels = await Channel.find();
        if (channels.length === 0) return next();

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

// 4. Bot Commands/Events
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

bot.on('chat_join_request', async (ctx) => {
    try {
        const { from, chat } = ctx.chatJoinRequest;
        await JoinRequest.findOneAndUpdate(
            { userId: from.id, chatId: chat.id.toString() },
            { requestedAt: new Date() },
            { upsert: true, returnDocument: 'after' }
        );
    } catch (e) {}
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
    } catch (e) {}
});

// Admin Panel Main Command
bot.command('admin', async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    
    const buttons = [
        ['📊 Statistika', '📢 Xabar yuborish'],
        ['🎬 Kino qo\'shish', '🎬 Kino tahrirlash'],
        ['📢 Kanal sozalamalari', '📽 Kino kanal linki'],
        ['🏠 Asosiy menyu']
    ];
    
    // Faqat EGAGA ko'rinadigan tugma
    if (ctx.from.id === OWNER_ID) {
        buttons.splice(3, 0, ['👥 Adminlar boshqaruvi']);
    }
    
    ctx.reply('Admin paneliga xush kelibsiz:', Markup.keyboard(buttons).resize());
});

bot.hears('📊 Statistika', async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const stats = await getStats();
    ctx.replyWithMarkdown(stats);
});

bot.hears('🎬 Kino qo\'shish', async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    adminState[ctx.from.id] = { step: 'waiting_movie' };
    ctx.reply('Kino faylini (yoki videoni) yuboring:');
});

bot.hears('🎬 Kino tahrirlash', async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    adminState[ctx.from.id] = { step: 'waiting_edit_code' };
    ctx.reply('Tahrirlamoqchi bo\'lgan kino kodini yuboring:');
});

bot.hears('📢 Kanal sozalamalari', async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    ctx.reply('Kanal boshqaruvi:', Markup.inlineKeyboard([
        [Markup.button.callback('➕ Kanal qo\'shish', 'add_channel')],
        [Markup.button.callback('❌ Kanalni o\'chirish', 'del_channel')]
    ]));
});

bot.hears('📽 Kino kanal linki', async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    adminState[ctx.from.id] = { step: 'waiting_setting_link' };
    ctx.reply('Barcha kino kodlari jamlangan kanal linkini yuboring (https://...):');
});

bot.hears('👥 Adminlar boshqaruvi', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    ctx.reply('Adminlarni boshqarish:', Markup.inlineKeyboard([
        [Markup.button.callback('➕ Admin qo\'shish', 'add_admin')],
        [Markup.button.callback('❌ Admin o\'chirish', 'del_admin')],
        [Markup.button.callback('📜 Adminlar ro\'yxati', 'list_admins')]
    ]));
});

bot.hears('📢 Xabar yuborish', async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    adminState[ctx.from.id] = { step: 'waiting_broadcast' };
    ctx.reply('Foydalanuvchilarga yubormoqchi bo\'lgan xabaringizni yozing:');
});

bot.hears('🏠 Asosiy menyu', (ctx) => {
    ctx.reply('Asosiy menyuga qaytdingiz.', Markup.removeKeyboard());
});

// Admin Callbacks
bot.action('add_channel', async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    adminState[ctx.from.id] = { step: 'adding_channel_id' };
    ctx.reply('Kanal ID sini yuboring (@kanal yoki -100...):');
});

bot.action('del_channel', async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    const channels = await Channel.find();
    if (channels.length === 0) return ctx.reply('Ulangan kanallar yo\'q.');
    const buttons = channels.map(ch => [Markup.button.callback(`❌ ${ch.chatId}`, `del_${ch._id}`)]);
    ctx.reply('O\'chirmoqchi bo\'lgan kanalingizni tanlang:', Markup.inlineKeyboard(buttons));
});

bot.action(/^del_(.+)$/, async (ctx) => {
    if (!(await isAdmin(ctx.from.id))) return;
    try {
        await Channel.findByIdAndDelete(ctx.match[1]);
        ctx.answerCbQuery('Kanal o\'chirildi');
        ctx.editMessageText('Kanal muvaffaqiyatli olib tashlandi.');
    } catch (e) { ctx.answerCbQuery('Xatolik yuz berdi'); }
});

// Admin Management Callbacks (OWNER ONLY)
bot.action('add_admin', (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    adminState[ctx.from.id] = { step: 'adding_admin_id' };
    ctx.reply('Yangi adminning Telegram ID sini yuboring:');
});

bot.action('list_admins', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const admins = await Admin.find();
    if (admins.length === 0) return ctx.reply('Qo\'shimcha adminlar yo\'q.');
    let text = '📜 *Adminlar ro\'yxati:*\n\n';
    admins.forEach((adm, i) => {
        text += `${i+1}. ID: \`${adm.telegramId}\`\n`;
    });
    ctx.replyWithMarkdown(text);
});

bot.action('del_admin', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const admins = await Admin.find();
    if (admins.length === 0) return ctx.reply('O\'chirish uchun adminlar yo\'q.');
    const buttons = admins.map(adm => [Markup.button.callback(`❌ ${adm.telegramId}`, `unadmin_${adm._id}`)]);
    ctx.reply('O\'chirmoqchi bo\'lgan adminni tanlang:', Markup.inlineKeyboard(buttons));
});

bot.action(/^unadmin_(.+)$/, async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    await Admin.findByIdAndDelete(ctx.match[1]);
    ctx.answerCbQuery('Admin o\'chirildi');
    ctx.editMessageText('Admin muvaffaqiyatli olib tashlandi.');
});

// Centralized State & Message Handler
let adminState = {};
bot.on('message', async (ctx, next) => {
    const userId = ctx.from.id;
    const isUserAdmin = await isAdmin(userId);
    const state = adminState[userId];

    if (isUserAdmin && state) {
        // Owner only flows
        if (userId === OWNER_ID) {
            if (state.step === 'adding_admin_id' && ctx.message.text) {
                const targetId = parseInt(ctx.message.text);
                if (isNaN(targetId)) return ctx.reply('ID faqat raqamlardan iborat bo\'lishi kerak.');
                try {
                    await new Admin({ telegramId: targetId }).save();
                    delete adminState[userId];
                    return ctx.reply(`✅ Foydalanuvchi (${targetId}) admin qilib tayinlandi!`);
                } catch (e) { return ctx.reply('❌ Bu ID allaqachon admin yoki xato yuz berdi.'); }
            }
        }

        // All admins flows
        if (state.step === 'adding_channel_id') {
            state.chatId = ctx.message.text;
            state.step = 'adding_channel_link';
            return ctx.reply('Kanal linkini yuboring:');
        }
        if (state.step === 'adding_channel_link') {
            state.inviteLink = ctx.message.text;
            state.step = 'adding_channel_name';
            return ctx.reply('Kanal nomini yuboring:');
        }
        if (state.step === 'adding_channel_name') {
            await new Channel({ chatId: state.chatId, inviteLink: state.inviteLink, name: ctx.message.text }).save();
            delete adminState[userId];
            return ctx.reply('✅ Kanal qo\'shildi!');
        }

        if (state.step === 'waiting_movie' && (ctx.message.video || ctx.message.document || ctx.message.photo)) {
            const fId = ctx.message.video ? ctx.message.video.file_id : (ctx.message.document ? ctx.message.document.file_id : ctx.message.photo[ctx.message.photo.length-1].file_id);
            state.fileId = fId;
            state.caption = ctx.message.caption || '';
            state.step = 'waiting_code';
            return ctx.reply('Kino uchun kod kiriting:');
        }
        if (state.step === 'waiting_code' && ctx.message.text) {
            try {
                await new Movie({ code: ctx.message.text, fileId: state.fileId, caption: state.caption }).save();
                delete adminState[userId];
                return ctx.reply('✅ Kino saqlandi!');
            } catch (e) { return ctx.reply('❌ Kod band yoki xato.'); }
        }

        if (state.step === 'waiting_edit_code' && ctx.message.text) {
            const movie = await Movie.findOne({ code: ctx.message.text });
            if (!movie) return ctx.reply('❌ Topilmadi.');
            state.editCode = ctx.message.text;
            state.step = 'waiting_new_file';
            return ctx.reply('Yangi faylni yuboring:');
        }
        if (state.step === 'waiting_new_file' && (ctx.message.video || ctx.message.document || ctx.message.photo)) {
            const fId = ctx.message.video ? ctx.message.video.file_id : (ctx.message.document ? ctx.message.document.file_id : ctx.message.photo[ctx.message.photo.length-1].file_id);
            await Movie.updateOne({ code: state.editCode }, { fileId: fId, caption: ctx.message.caption || '' });
            delete adminState[userId];
            return ctx.reply('✅ Yangilandi!');
        }

        if (state.step === 'waiting_setting_link' && ctx.message.text) {
            await Setting.findOneAndUpdate({ key: 'movieChannelLink' }, { value: ctx.message.text }, { upsert: true });
            delete adminState[userId];
            return ctx.reply('✅ Link saqlandi!');
        }

        if (state.step === 'waiting_broadcast') {
            state.broadcastMsg = ctx.message;
            state.step = 'asking_buttons';
            return ctx.reply('Tugmalar format: `Nomi | Link` yoki "Yo\'q":');
        }
        if (state.step === 'asking_buttons' && ctx.message.text) {
            const keyboard = parseButtons(ctx.message.text);
            const users = await User.find();
            ctx.reply(`🚀 Yuborilmoqda...`);
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
            return ctx.reply(`✅ Yakunlandi.\nYuborildi: ${sent}\nBlok: ${blocked}`);
        }
    }
    return next();
// Kodingizning eng oxiridagi qismni quyidagiga almashtiring:
}, checkSubscription, async (ctx) => {
    if (ctx.message && ctx.message.text) {
        const text = ctx.message.text;
        if (text.startsWith('/')) return;
        
        const movie = await Movie.findOne({ code: text });
        
        try { // <--- Shu yerda try-catch boshlanadi
            if (movie) {
                try { 
                    await ctx.replyWithVideo(movie.fileId, { caption: movie.caption }); 
                } catch (e) {
                    try { 
                        await ctx.replyWithDocument(movie.fileId, { caption: movie.caption }); 
                    } catch (e2) { 
                        await ctx.reply('Fayl yuborishda xato.'); 
                    }
                }
            } else {
                const setting = await Setting.findOne({ key: 'movieChannelLink' });
                await ctx.reply(`❌ Topilmadi.\n\n🎥 Kodlar kanali:\n${setting ? setting.value : 'Yo\'q'}`);
            }
        } catch (error) { // <--- Foydalanuvchi bloklagan bo'lsa, xato shu yerda tutiladi
            if (error.response && error.response.error_code === 403) {
                console.log(`Foydalanuvchi ${ctx.from.id} botni bloklagan.`);
                // Bazada statusni yangilab qo'yish ham foydali
                await User.updateOne({ telegramId: ctx.from.id }, { status: 'blocked' });
            } else {
                console.error("Xabar yuborishda kutilmagan xato:", error);
            }
        }
    }
});

bot.catch((err, ctx) => console.error(`Error:`, err));
bot.launch().then(() => console.log('Bot ishga tushdi...'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
