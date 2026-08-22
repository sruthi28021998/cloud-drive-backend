import { pool } from '../config/db.js';
import { supabase, BUCKET } from '../config/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

const testDb = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Postgres connected:', result.rows[0].now);
  } catch (err) {
    console.error('❌ Postgres connection failed:', err.message);
  }
};

const testStorage = async () => {
  try {
    const { data, error } = await supabase.storage.getBucket(BUCKET);
    if (error) throw error;
    console.log('✅ Supabase Storage bucket found:', data.name);
  } catch (err) {
    console.error('❌ Supabase Storage check failed:', err.message);
  }
};

const run = async () => {
  await testDb();
  await testStorage();
  await pool.end();
};

run();