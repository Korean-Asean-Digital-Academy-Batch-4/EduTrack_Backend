const { pool } = require('../../db/pool');
const { ok, created } = require('../../utils/response');
const AppError = require('../../utils/AppError');

async function listAcademicYears(req, res) {
  const { rows } = await pool.query('SELECT * FROM academic_years ORDER BY name DESC');
  return ok(res, rows);
}

async function createAcademicYear(req, res) {
  const { name } = req.body;
  if (!name) throw AppError.badRequest('name wajib diisi');
  const { rows } = await pool.query(
    'INSERT INTO academic_years (name) VALUES ($1) RETURNING *',
    [name]
  );
  return created(res, rows[0], 'Tahun ajaran berhasil dibuat');
}

async function listSemesters(req, res) {
  const { academicYearId } = req.query;
  const params = [];
  let where = '';
  if (academicYearId) {
    params.push(academicYearId);
    where = 'WHERE academic_year_id = $1';
  }
  const { rows } = await pool.query(
    `SELECT * FROM semesters ${where} ORDER BY name`,
    params
  );
  return ok(res, rows);
}

async function createSemester(req, res) {
  const { academicYearId, name } = req.body;
  if (!academicYearId || !name) throw AppError.badRequest('academicYearId dan name wajib diisi');
  if (!['Ganjil', 'Genap'].includes(name)) throw AppError.badRequest('name harus Ganjil atau Genap');
  const { rows } = await pool.query(
    'INSERT INTO semesters (academic_year_id, name) VALUES ($1, $2) RETURNING *',
    [academicYearId, name]
  );
  return created(res, rows[0], 'Semester berhasil dibuat');
}

module.exports = { listAcademicYears, createAcademicYear, listSemesters, createSemester };
