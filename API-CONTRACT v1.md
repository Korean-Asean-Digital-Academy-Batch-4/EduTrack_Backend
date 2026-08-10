# EduTrack — API Contract (MVP)

Base URL: `{{APP_BASE_URL}}/api` (lihat `04-ENV.md`)
Format: JSON, `Content-Type: application/json` (kecuali endpoint upload berkas → `multipart/form-data`)
Auth: `Authorization: Bearer <JWT>` pada seluruh endpoint kecuali `POST /auth/login`

## 0. Konvensi umum

**Amplop respons sukses**
```json
{
  "success": true,
  "message": "Nilai berhasil disimpan",
  "data": { }
}
```

**Amplop respons gagal** — wajib ada di setiap aksi input/ubah data (PRD §6.1.6 / M9):
```json
{
  "success": false,
  "message": "Baris 4 pada berkas tidak dapat dibaca: kolom NIS kosong",
  "errors": [
    { "field": "row_4.nis", "reason": "required" }
  ]
}
```

**Kode HTTP status**: `200` sukses baca, `201` sukses buat, `400` validasi gagal, `401` belum login,
`403` tidak berwenang (role salah / bukan pemilik data), `404` tidak ditemukan, `409` konflik
(cth NIS duplikat, sesi presensi duplikat), `422` gagal proses bisnis (cth finalisasi ditolak).

**Role & scope token JWT** (claims):
```json
{ "sub": "<user_id>", "role": "admin | teacher | student",
  "is_homeroom_of": ["<class_id>", "..."] }
```
`is_homeroom_of` kosong untuk Guru Mapel biasa; berisi 1 kelas untuk Wali Kelas.

**Paginasi** (endpoint list): query `?page=1&pageSize=20`, respons `data.items[]` + `data.meta.total`.

---

## 1. Auth

### `POST /auth/login`
Body: `{ "identifier": "198501012010011001", "password": "xxxx" }`
(`identifier` = NIP untuk Guru, NIS untuk Siswa, email untuk Administrator)

Res `200`:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "role": "teacher",
    "profile": { "id": "uuid", "name": "Pak Cahyo", "nip": "1985...", "isHomeroom": true, "homeroomClassId": "uuid-or-null" }
  }
}
```
Res `401`: `{ "success": false, "message": "NIP/NIS atau kata sandi salah" }`

> **Lupa kata sandi** bukan endpoint — tombol di FE cukup menampilkan pesan statis
> *"Tolong hubungi Wali Kelas / Admin Sekolah."* tanpa memanggil API (§6.1.3).

---

## 2. Administrator — Master Data

### Tahun Ajaran & Semester
| Method | Path | Keterangan |
|---|---|---|
| GET | `/admin/academic-years` | daftar tahun ajaran |
| POST | `/admin/academic-years` | `{ "name": "2026/2027" }` |
| GET | `/admin/semesters?academicYearId=` | daftar semester |
| POST | `/admin/semesters` | `{ "academicYearId": "uuid", "name": "Ganjil" }` |

### Akun Guru & Siswa
| Method | Path | Keterangan |
|---|---|---|
| POST | `/admin/teachers` | manual, `{ "nip": "...", "name": "..." }` → password auto-generate |
| POST | `/admin/teachers/import` | `multipart/form-data`, field `file` (CSV: Nama, NIP) |
| GET | `/admin/teachers?query=` | daftar + pencarian |
| PATCH | `/admin/teachers/:id/reset-password` | admin reset password, res berisi `newPassword` sekali tampil |
| POST | `/admin/students` | manual, `{ "nis": "...", "name": "..." }` |
| POST | `/admin/students/import` | CSV: Nama, NIS |
| GET | `/admin/students?query=` | daftar + pencarian |
| PATCH | `/admin/students/:id/reset-password` | sama seperti guru |
| GET | `/admin/templates/teachers-csv` | unduh templat CSV kosong |
| GET | `/admin/templates/students-csv` | unduh templat CSV kosong |
| GET | `/admin/templates/class-students-xlsx` | unduh templat Excel (kolom: Kelas, NIS, Nama) |

Contoh respons import (per PRD, pesan gagal sebut alasan per baris):
```json
{
  "success": true,
  "message": "18 dari 20 akun berhasil dibuat",
  "data": {
    "createdCount": 18,
    "failedRows": [
      { "row": 5, "reason": "NIP kosong" },
      { "row": 12, "reason": "NIP sudah terdaftar" }
    ]
  }
}
```

### Mata Pelajaran (lapis 1 & 2)
| Method | Path | Keterangan |
|---|---|---|
| POST | `/admin/subjects` | `{ "name": "Biologi", "gradeLevel": "X", "kkm": 75, "teacherId": "uuid" }` |
| GET | `/admin/subjects?gradeLevel=` | daftar |
| PATCH | `/admin/subjects/:id` | ubah `kkm` atau `teacherId` |

Error khas (409): guru sudah mengampu mapel lain →
`{ "success": false, "message": "Pak Cahyo sudah mengampu Biologi X, satu guru hanya dapat mengampu satu mata pelajaran" }`

### Kelas (lapis 3) + Wali Kelas
| Method | Path | Keterangan |
|---|---|---|
| POST | `/admin/classes` | `{ "name": "X IPA 3", "gradeLevel": "X", "semesterId": "uuid" }` |
| POST | `/admin/classes/:id/students/import` | `multipart/form-data`, Excel (Kelas, NIS, Nama); NIS = kunci pencocokan |
| POST | `/admin/classes/:id/subjects` | `{ "subjectId": "uuid" }` — ditolak jika jenjang tak cocok |
| PATCH | `/admin/classes/:id/homeroom-teacher` | `{ "teacherId": "uuid" }` |
| GET | `/admin/classes/:id` | detail lengkap: siswa, mapel+guru, wali kelas |

Error khas (400) — ketidakcocokan jenjang (§8.2):
```json
{ "success": false, "message": "Kelas berjenjang X tidak dapat dihubungkan dengan Biologi XI (guru mengampu jenjang XI)" }
```

### Nilai & Presensi — akses penuh Admin
| Method | Path | Keterangan |
|---|---|---|
| PUT | `/admin/grades` | sama payload dengan endpoint guru (§3), tapi Admin dapat menembus rapor yang sudah Final |
| PUT | `/admin/attendance-sessions/:id/records` | idem |

---

## 3. Guru Mata Pelajaran

Semua endpoint di bawah otomatis dibatasi ke kelas & mapel yang ditugaskan ke guru yang login
(diturunkan dari token, tidak perlu dikirim FE).

| Method | Path | Keterangan |
|---|---|---|
| GET | `/teacher/classes` | kelas yang diajar guru ini |
| GET | `/teacher/classes/:classId/students` | daftar siswa + status kelengkapan nilai |
| GET | `/teacher/classes/:classId/grades` | nilai semua siswa × 8 komponen pada mapel guru ini |
| PUT | `/teacher/classes/:classId/grades` | simpan nilai (bulk), lihat contoh di bawah |
| GET | `/teacher/classes/:classId/attendance-sessions` | daftar sesi yang pernah dibuka |
| POST | `/teacher/classes/:classId/attendance-sessions` | buka sesi baru `{ "date": "2026-08-06" }` |
| GET | `/teacher/attendance-sessions/:id` | detail sesi + status seluruh siswa |
| PUT | `/teacher/attendance-sessions/:id/records` | simpan status kehadiran (bulk) |
| POST | `/teacher/attendance-sessions/:id/mark-all-present` | tombol "Hadir Semua" |
| DELETE | `/teacher/attendance-sessions/:id` | hapus sesi (dan seluruh recordnya) |

### `PUT /teacher/classes/:classId/grades`
Body:
```json
{
  "entries": [
    { "studentId": "uuid-1", "componentCode": "T1", "score": 88 },
    { "studentId": "uuid-1", "componentCode": "UTS", "score": null },
    { "studentId": "uuid-2", "componentCode": "T1", "score": 75 }
  ]
}
```
`score: null` berarti dikosongkan (bukan 0) — ditandai "belum lengkap".

Res `200`:
```json
{ "success": true, "message": "Nilai berhasil disimpan", "data": { "savedCount": 3 } }
```

### `POST /teacher/classes/:classId/attendance-sessions`
Res `201` — backend otomatis membuat baris `Alpa` untuk seluruh siswa kelas:
```json
{
  "success": true,
  "message": "Sesi presensi 6 Agustus 2026 dibuka",
  "data": {
    "sessionId": "uuid",
    "students": [
      { "studentId": "uuid-1", "name": "Siswa A", "status": "Alpa" },
      { "studentId": "uuid-2", "name": "Siswa B", "status": "Alpa" }
    ]
  }
}
```

### `PUT /teacher/attendance-sessions/:id/records`
Body: `{ "records": [ { "studentId": "uuid-1", "status": "Hadir" }, { "studentId": "uuid-2", "status": "Izin" } ] }`
`status` ∈ `Hadir | Izin | Sakit | Alpa`.

Res `409` (jika sesi guru+kelas+tanggal sudah ada saat POST session):
```json
{ "success": false, "message": "Sesi untuk kelas ini pada tanggal tersebut sudah dibuka" }
```

---

## 4. Wali Kelas

Endpoint ini hanya bisa diakses jika `token.is_homeroom_of` memuat `:classId` terkait.

| Method | Path | Keterangan |
|---|---|---|
| GET | `/homeroom/classes/:classId/overview` | ringkasan nilai lintas mapel + presensi seluruh siswa kelas walinya |
| GET | `/homeroom/classes/:classId/completeness` | cek kelengkapan tiap mapel (dipakai sebelum finalisasi) |
| GET | `/homeroom/report-cards/:studentId` | rapor 1 siswa (draft/final) |
| PATCH | `/homeroom/report-cards/:studentId/note` | `{ "note": "Catatan umum..." }` |
| POST | `/homeroom/classes/:classId/finalize` | finalisasi rapor **seluruh siswa** di kelas ini sekaligus |
| POST | `/homeroom/classes/:classId/distribute` | distribusi rapor (hanya jika status `Finalized`) |
| GET | `/homeroom/report-cards/:studentId/download` | unduh PDF rapor |

### `POST /homeroom/classes/:classId/finalize`
Res `422` bila ada mapel belum lengkap (PRD §6.3, pesan per mapel):
```json
{
  "success": false,
  "message": "Finalisasi ditolak, terdapat mata pelajaran yang belum lengkap",
  "errors": [
    { "subject": "Kimia X", "reason": "Data Mapel Kimia X belum ada, tolong hubungi guru yang bertanggung jawab." }
  ]
}
```
Res `200` jika berhasil:
```json
{ "success": true, "message": "Rapor kelas X IPA 3 berhasil difinalisasi", "data": { "finalizedCount": 32 } }
```

---

## 5. Siswa

| Method | Path | Keterangan |
|---|---|---|
| GET | `/student/grades` | nilai + bobot seluruh mapel semester berjalan |
| GET | `/student/attendance` | persentase kehadiran per mapel |
| POST | `/student/ai-insight` | tombol **Suggestion** — sekali jalan, tidak disimpan |
| GET | `/student/report-card` | status rapor (Draft/Finalized/Distributed); isi hanya tampil jika `Distributed` |
| GET | `/student/report-card/download` | unduh PDF (hanya jika `Distributed`) |

### `POST /student/ai-insight`
Tidak ada body. Res `200`:
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-08-06T09:00:00Z",
    "dataPeriod": "Semester Ganjil 2026/2027",
    "isPartialData": true,
    "recommendationParagraph": "Secara umum capaianmu di semester ini cukup baik...",
    "bullets": [
      "Nilai Matematika masih di bawah KKM pada komponen UTS",
      "Kehadiran Matematika 78%, lebih rendah dibanding mapel lain"
    ],
    "actionOptions": [
      "Opsi A: ulangi latihan persamaan linear",
      "Opsi B: tanyakan tugas yang belum lengkap kepada Guru"
    ]
  }
}
```
`isPartialData: true` → FE wajib menampilkan penanda **"Data Sementara"** di sekitar hasil (§8.5,
penanda ditampilkan halaman, bukan bagian teks AI). Res `503` jika layanan AI gagal — **tidak**
boleh menghambat fitur lain (§8.6 poin 7):
```json
{ "success": false, "message": "Rekomendasi belum dapat dibuat saat ini, coba lagi sebentar lagi" }
```

---

## 6. Ringkasan matriks akses (silang cek dengan PRD §8.1)

| Endpoint group | Admin | Guru Mapel | Wali Kelas | Siswa |
|---|:--:|:--:|:--:|:--:|
| `/admin/*` | ✅ | ❌ | ❌ | ❌ |
| `/teacher/*` (kelas sendiri) | ✅ (semua) | ✅ | ✅ (mapel sendiri) | ❌ |
| `/homeroom/*` (kelas wali) | ✅ (semua) | ❌ | ✅ | ❌ |
| `/student/*` (data sendiri) | ✅ (baca) | ❌ | ❌ | ✅ |

---

## 7. Untuk kerja paralel FE hari ini

- FE dapat langsung membuat **mock server** (mis. `msw` atau `json-server`) dari contoh JSON
  di dokumen ini sembari BE mengimplementasikan endpoint sungguhan — bentuk payload sudah final,
  tinggal disepakati di meeting.
- Field JSON dipakai **camelCase**; DB kolom **snake_case** (mapping di BE, bukan urusan FE).
- Semua tanggal pakai format ISO 8601 (`YYYY-MM-DD` untuk tanggal, penuh timestamptz untuk waktu).
