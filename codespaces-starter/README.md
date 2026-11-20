# KirimAI — WhatsApp Blaster Marketing dengan Google Gemini AI

Aplikasi WhatsApp Blaster Marketing universal berbasis **Node.js (Express + Baileys Multi-Device)** dan **Google Gemini AI**.

## Fitur Utama
- **WhatsApp Multi-Device Pairing**: Scan QR Code dari terminal atau langsung lewat dashboard web.
- **AI Copywriting Generator**: Membuat variasi pesan promosi WhatsApp sesuai nama usaha, produk, target konsumen, promo, dan gaya bahasa.
- **AI Auto-Responder**: Membalas chat WhatsApp masuk secara otomatis dan kontekstual sesuai profil bisnis Anda.
- **Anti-Banned Mass Blaster**: Pengiriman massal bertahap dengan jeda acak otomatis (3–5 detik per nomor) dan personalisasi `{nama}`.

## Cara Menjalankan di Terminal / GitHub Codespaces
1. Install dependensi:
   ```bash
   npm install
   ```
2. Salin `.env.example` menjadi `.env` dan isi `GEMINI_API_KEY`:
   ```bash
   cp .env.example .env
   ```
3. Jalankan server:
   ```bash
   npm start
   ```
4. Scan QR Code yang muncul di terminal atau buka `http://localhost:3000` di browser / HP.
