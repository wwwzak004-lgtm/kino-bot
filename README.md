# Telegram Kino Kodli Bot

Ushbu bot foydalanuvchilarga kino kodlari orqali fayllarni yuklab olish imkonini beradi. Botda majburiy obuna va kuchli admin panel mavjud.

## O'rnatish yo'riqnomasi

### 1. Mahalliy ishga tushirish
1. Loyihani yuklab oling.
2. `npm install` buyrug'ini bering.
3. `.env.example` faylini `.env` deb o'zgartiring va undagi ma'lumotlarni to'ldiring:
   - `BOT_TOKEN`: @BotFather dan olingan token.
   - `MONGO_URI`: MongoDB Atlas dan olingan ulanish havolasi.
   - `ADMIN_ID`: Sizning Telegram ID raqamingiz (@userinfobot orqali olish mumkin).
4. `node index.js` buyrug'i bilan botni ishlating.

### 2. Render.com ga yuklash (Hosting)
1. GitHub-da yangi repozitoriy oching va kodlarni yuklang.
2. Render.com ga kiring va **New + Web Service** tanlang.
3. GitHub repozitoriyangizni ulang.
4. **Environment Variables** bo'limiga `.env` dagi barcha o'zgaruvchilarni qo'shing.
5. **Start Command:** `node index.js`.
6. **Port:** `10000` (Render avtomatik bog'laydi).

## Admin Panel Funksiyalari
- `/admin` buyrug'ini yuboring.
- **Statistika:** Faol va bloklangan foydalanuvchilarni ko'rish.
- **Xabar yuborish:** Rasm, video yoki matnli xabarlarni barcha a'zolarga (tugma bilan) yuborish.
- **Kino qo'shish:** Faylni yuboring va unga kod biriktiring.
- **Kanal sozlamalari:** Majburiy obuna kanallarini boshqarish.

## Muhim Tavsiyalar
- Bot barcha kanallarda **Admin** bo'lishi shart (azoni tekshirish uchun).
- MongoDB IP listida `0.0.0.0/0` ruxsatini yoqing.
