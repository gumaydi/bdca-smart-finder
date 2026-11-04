# Panduan Deployment Vercel: BDCA Smart Finder (Wisuda)

Dokumen ini memuat panduan lengkap penerapan aplikasi **BDCA Smart Finder (Wisuda)** ke platform hosting serverless **Vercel** melalui integrasi GitHub.

---

## 1. Prasyarat

Sebelum melakukan deployment, pastikan hal-hal berikut telah siap:

1. **Akun GitHub & Repository**: Repository GitHub sudah diperbarui dengan kode terbaru pada branch `main`.
2. **Akun Vercel**: Akun Vercel aktif yang terhubung dengan akun GitHub Anda.
3. **Database Supabase**: Project Supabase (`vlxltonalfsyklzrqfja.supabase.co`) sudah terisi 659 wisudawan dan konfigurasi denah aktif.
4. **Kredensial Server**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD`
   - *(Opsional)* `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`

---

## 2. Arsitektur Runtime & Serverless Functions

Aplikasi Next.js pada BDCA Smart Finder menggunakan konfigurasi serverless teroptimasi untuk Vercel:

| Endpoint | Runtime | Caching / Dynamic | Keterangan |
|---|---|---|---|
| `/` (Halaman Utama) | Client / SSR | Dynamic Client App | UI denah interaktif, BottomSheet, pencarian cepat, Supabase Realtime WebSocket |
| `/api/attendance` | Node.js | `force-dynamic` | Catat kehadiran wisudawan via service role, validasi UUID, anti-tampering, rate limited |
| `/api/admin/session` | Node.js | `force-dynamic` | Autentikasi sesi admin dengan httpOnly secure cookie & brute-force protection |
| `/api/admin/layout` | Node.js | `force-dynamic` | Pratinjau dan perubahan struktur baris/blok denah dengan verifikasi sesi admin |

> [!NOTE]
> Seluruh API routes menggunakan runtime `nodejs` dan direktif `export const dynamic = 'force-dynamic'` untuk mencegah static page generation caching dan memastikan eksekusi serverless yang konsisten pada setiap request Vercel Functions.

---

## 3. Langkah-Langkah Deployment via Vercel Dashboard

### Langkah 1: Hubungkan Repository GitHub

1. Masuk ke dashboard [Vercel](https://vercel.com/dashboard).
2. Klik tombol **"Add New..."** lalu pilih **"Project"**.
3. Pada daftar *Import Git Repository*, pilih repository **`denah-kursi-wisuda`** (atau nama repository yang Anda tentukan).
4. Klik tombol **"Import"**.

### Langkah 2: Konfigurasi Project

Pada layar *Configure Project*:
- **Project Name**: `denah-kursi-wisuda` (atau nama custom sesuai kebutuhan, e.g. `bdca-smart-finder`).
- **Framework Preset**: `Next.js` (terdeteksi otomatis).
- **Root Directory**: `./` (default).
- **Build Command**: `next build` (default).
- **Output Directory**: `.next` (default).
- **Install Command**: `npm install` (default).

### Langkah 3: Pengaturan Environment Variables

Buka bagian **Environment Variables** sebelum menekan tombol Deploy. Masukkan variabel berikut untuk seluruh environment (**Production**, **Preview**, **Development**):

| Nama Variabel | Deskripsi | Contoh / Format |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL endpoint Supabase remote | `https://vlxltonalfsyklzrqfja.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Anon Key / Publishable Key | `eyJhbGciOi...` / `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key (Khusus Server) | `sb_secret_...` |
| `ADMIN_PASSWORD` | Password akses admin panel | Password kuat pilihan Anda |
| `UPSTASH_REDIS_REST_URL` | *(Opsional)* Upstash Redis REST URL | `https://...upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | *(Opsional)* Upstash Redis REST Token | Token Upstash Redis |

> [!CAUTION]
> Jangan pernah mencentang atau menambahkan `SUPABASE_SERVICE_ROLE_KEY` dengan awalan `NEXT_PUBLIC_`. Kunci ini memiliki hak akses penuh ke database dan hanya boleh dibaca oleh Vercel Functions di sisi server.

### Langkah 4: Jalankan Deploy

1. Klik tombol **"Deploy"**.
2. Vercel akan menjalankan build otomatis:
   - Instalasi dependensi (termasuk SheetJS via `.npmrc`).
   - Type-checking TypeScript (`tsc --noEmit`).
   - Linting ESLint.
   - Kompilasi Next.js (`next build`).
3. Tunggu hingga proses build selesai dan status menjadi **"Ready"** (biasanya memakan waktu 1–2 menit).

---

## 4. Verifikasi Pasca Deployment

Setelah URL produksi Vercel aktif (misal `https://denah-kursi-wisuda.vercel.app`):

1. **Uji Akses Publik**:
   - Buka URL produksi melalui browser mobile dan desktop.
   - Pastikan seluruh 659 peserta dapat dicari melalui nama, NIM, atau program studi.
   - Verifikasi bahwa alokasi kursi (blok, baris, rentang kursi, lokasi depan/belakang) tampil akurat.

2. **Uji Realtime Multi-Perangkat**:
   - Buka aplikasi di dua perangkat / browser berbeda (misal: Laptop dan HP panitia).
   - Pada salah satu perangkat, buka detail peserta dan klik tombol **"Tandai Hadir"**.
   - Periksa perangkat kedua: status kehadiran harus terbarui menjadi hijau secara instan tanpa perlu memuat ulang (*refresh*) halaman.

3. **Uji Admin Panel**:
   - Klik ikon toga di sudut kanan atas header.
   - Masukkan `ADMIN_PASSWORD` yang telah dikonfigurasi pada Vercel Environment Variables.
   - Pastikan admin berhasil masuk, denah aktif dari Supabase termuat, dan fungsi simulasi baris/blok dapat dijalankan.

---

## 5. Konfigurasi Domain Kustom (Opsional)

Jika institusi/panitia wisuda memiliki domain khusus (misal `wisuda.kampus.ac.id`):
1. Masuk ke **Settings > Domains** di project Vercel.
2. Tambahkan domain/subdomain yang diinginkan.
3. Tambahkan DNS Record (CNAME atau A record) sesuai petunjuk yang diberikan oleh Vercel pada panel manajemen DNS domain Anda.
4. Sertifikat SSL (HTTPS) akan dibuat dan diperbarui secara otomatis oleh Let's Encrypt / Vercel.
