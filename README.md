# BDCA Smart Finder — Denah & Alokasi Kursi Orang Tua Wisudawan

Sistem informasi denah interaktif, pelacakan kursi orang tua wisudawan, dan pencatatan kehadiran (*attendance tracking*) secara *real-time* berbasis Next.js, TypeScript, Tailwind CSS, dan Supabase.

---

## 🏛️ Gambaran Umum Sistem

Aplikasi ini dirancang khusus untuk mempermudah panitia wisuda dalam:
1. **Pencarian Cepat Wisudawan**: Menemukan lokasi kursi berdasarkan Nama, NIM, atau Program Studi dalam hitungan milidetik.
2. **Visualisasi Denah Realistis**: Denah dua zona aula (*Depan / D* dan *Belakang / B*) dengan penomoran kursi kanan ke kiri (*Right-to-Left* saat menghadap panggung), lorong tengah (*aisle*), serta pemisahan blok teralis.
3. **Alokasi Kursi Orang Tua Otomatis**: Setiap wisudawan reguler memperoleh 1 pasangan kursi berdampingan (2 kursi) untuk kedua orang tua mereka (total 1.318 kursi dari kapasitas aula 1.352 kursi).
4. **Sinkronisasi Kehadiran Realtime**: Perubahan status kehadiran langsung tersinkronisasi ke seluruh layar panitia melalui Supabase Realtime WebSocket tanpa perlu refresh halaman.
5. **Panel Admin Dinamis**: Pengaturan baris dan blok denah aula yang fleksibel dengan simulasi kapasitas instan dan keamanan berbasis cookie terotentikasi.

---

## 📐 Arsitektur Denah & Alokasi Kursi

- **Area Denah**:
  - **Area Depan (D)**: Blok D1 s.d. D7 (bawaan 18 baris).
  - **Area Belakang (B)**: Blok B1 s.d. B7 (bawaan 8 baris).
- **Orientasi**: Blok dan nomor kursi dihitung dari kanan ke kiri saat menghadap panggung utama.
- **Kapasitas Blok**: Blok 1–6 menampung 8 kursi per baris; Blok 7 menampung 4 kursi per baris.
- **Tampilan Pasangan**: Pasangan kursi ditampilkan berurutan dari kiri ke kanan (misal 8–7, 6–5, 4–3, 2–1). Kursi ganjil tersisa menjadi cadangan tunggal.
- **Kapasitas Fisik**: Konfigurasi standar menampung 1.352 kursi (676 pasangan kursi), mencukupi kebutuhan 659 wisudawan (1.318 kursi) dengan 34 kursi cadangan.

---

## 🚀 Memulai Pengembangan Lokal

### Prasyarat
- **Node.js**: Versi 20.x atau 22.x LTS
- **npm**: Versi 10.x atau lebih baru

### 1. Kloning & Instalasi Dependensi
```bash
git clone git@github.com:gumaydi/denah-kursi-wisuda.git
cd denah-kursi-wisuda
npm ci
```

### 2. Konfigurasi Lingkungan (.env.local)
Salin berkas template lingkungan:
```bash
cp .env.example .env.local
```
Sesuaikan kredensial Supabase dan password admin pada `.env.local`.

### 3. Menjalankan Server Pengembangan
```bash
npm run dev
```
Akses aplikasi di browser:
- **Mode Normal (Supabase Remote)**: [http://localhost:3000](http://localhost:3000)
- **Mode Pratinjau / Simulasi Mandiri (Tanpa Supabase)**: [http://localhost:3000/?preview=1](http://localhost:3000/?preview=1)

---

## 🧪 Pengujian & Verifikasi Kualitas

Sistem dilengkapi rangkaian pengujian otomatis (*automated test suite*) yang ketat:

```bash
# Validasi normalisasi 21 program studi
npm run test:prodi

# Pengujian alokasi matematika denah & kapasitas pasangan
npm run test:seats

# Pengujian keamanan sesi admin, brute-force rate limiter, dan cookie
npm run test:admin

# Pengujian keamanan RLS PostgreSQL & larangan bypass client
npm run test:security
npm run test:security:postgres

# Pengujian endpoint kehadiran (anti-tampering & origin check)
npm run test:api:attendance

# Pengujian integrasi Supabase denah aktif
npm run test:layout

# Pengujian User Acceptance Testing (UAT) komprehensif
npm run test:uat

# Pengujian End-to-End integrasi
npm run test:e2e

# Type check & build produksi
npx tsc --noEmit
npm run lint
npm run build
```

---

## 📖 Dokumentasi Teknis

- 🗄️ **[Panduan Integrasi Database Supabase](docs/SUPABASE-INTEGRATION.md)**: Skema tabel PostgreSQL, RLS policies, migrasi idempotent, optimasi performa indeks, dan audit hak akses service role.
- ☁️ **[Panduan Deployment Vercel](docs/VERCEL-DEPLOYMENT.md)**: Konfigurasi serverless function runtime, setup environment variables Vercel, verifikasi domain, dan panduan deployment satu klik dari GitHub.

---

## 🔐 Keamanan & Integritas Data

- **RLS (Row Level Security)**: Mengunci mutasi langsung dari browser. Semua check-in kehadiran diverifikasi melalui serverless API route menggunakan Service Role terproteksi.
- **Admin Password**: Disimpan secara aman di environment server (`ADMIN_PASSWORD`), tidak pernah diekspos ke client-side JavaScript.
- **Privasi Data**: File master wisudawan (Excel/CSV) dan file kredensial lokal dikecualikan secara ketat melalui `.gitignore` untuk melindungi kerahasiaan data pribadi peserta wisuda.
