const { pool } = require('../../db/pool');
const { comparePassword } = require('../../utils/password');
const { signToken } = require('../../utils/jwt');
const { ok, fail } = require('../../utils/response');
const AppError = require('../../utils/AppError');

// identifier: email (Administrator) | NIP (Guru) | NIS (Siswa)
async function login(req, res) {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    throw AppError.badRequest('identifier dan password wajib diisi');
  }

  const admin = await pool.query('SELECT * FROM administrators WHERE email = $1', [identifier]);
  if (admin.rows.length) {
    return respondIfValid(res, admin.rows[0], password, 'admin', buildAdminProfile);
  }

  const teacher = await pool.query('SELECT * FROM teachers WHERE nip = $1', [identifier]);
  if (teacher.rows.length) {
    return respondIfValidTeacher(res, teacher.rows[0], password);
  }

  const student = await pool.query('SELECT * FROM students WHERE nis = $1', [identifier]);
  if (student.rows.length) {
    return respondIfValid(res, student.rows[0], password, 'student', (u) => ({
      id: u.id, name: u.name, nis: u.nis,
    }));
  }

  return fail(res, 401, 'NIP/NIS/email atau kata sandi salah');
}

function respondIfValid(res, user, password, role, buildProfile) {
  if (!comparePassword(password, user.password_hash)) {
    return fail(res, 401, 'NIP/NIS/email atau kata sandi salah');
  }
  const token = signToken({ sub: user.id, role, isHomeroomOf: [] });
  return ok(res, { token, role, profile: buildProfile(user) }, 'Berhasil masuk');
}

async function respondIfValidTeacher(res, teacher, password) {
  if (!comparePassword(password, teacher.password_hash)) {
    return fail(res, 401, 'NIP/NIS/email atau kata sandi salah');
  }
  const homeroomClasses = await pool.query(
    'SELECT id FROM classes WHERE homeroom_teacher_id = $1',
    [teacher.id]
  );
  const isHomeroomOf = homeroomClasses.rows.map((r) => r.id);
  const token = signToken({ sub: teacher.id, role: 'teacher', isHomeroomOf });
  return ok(res, {
    token,
    role: 'teacher',
    profile: {
      id: teacher.id,
      name: teacher.name,
      nip: teacher.nip,
      isHomeroom: isHomeroomOf.length > 0,
      homeroomClassId: isHomeroomOf[0] || null,
    },
  }, 'Berhasil masuk');
}

function buildAdminProfile(u) {
  return { id: u.id, name: u.name, email: u.email };
}

module.exports = { login };
