#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────
   migrate-images.mjs — One-time migration των τοπικών εικόνων
                        από το tsox-site στο Supabase Storage (media bucket)
   ────────────────────────────────────────────────────────────────
   Setup:
     1) cd "c:/Users/strat/OneDrive/Υπολογιστής/skinya-admin/scripts"
     2) npm install
     3) Πάρε το service_role key από Supabase Dashboard → Project Settings → API
     4) PowerShell:  $env:SUPABASE_SERVICE_KEY="eyJhbGciOi..."
        Bash:        export SUPABASE_SERVICE_KEY="eyJhbGciOi..."

   Run:
     npm run migrate:dry   ← preview χωρίς αλλαγές
     npm run migrate       ← κανονικό upload + DB update
   ──────────────────────────────────────────────────────────────── */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFile, access } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import { constants as FS } from 'node:fs';

// ── CONFIG ──────────────────────────────────────────────────────
const SUPABASE_URL = 'https://swkdewwmmxsftdmzjqsr.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const SITE_ROOT    = process.env.SITE_ROOT || 'c:/Users/strat/OneDrive/Υπολογιστής/tsox site';
const BUCKET       = 'media';
const DRY_RUN      = process.argv.includes('--dry');

if(!SERVICE_KEY){
  console.error('❌ Λείπει το env var SUPABASE_SERVICE_KEY');
  console.error('   PowerShell:  $env:SUPABASE_SERVICE_KEY="..."');
  console.error('   Bash:        export SUPABASE_SERVICE_KEY="..."');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ── HELPERS ─────────────────────────────────────────────────────
const isRemote = (u) => /^https?:\/\//i.test(u || '');

function slugify(s){
  return (s || 'image')
    .replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'image';
}

async function fileToWebp(absPath){
  await access(absPath, FS.R_OK);
  const ext = extname(absPath).toLowerCase();
  const buf = await readFile(absPath);
  if(ext === '.webp'){
    // Already webp — upload as-is
    return { buf, contentType: 'image/webp' };
  }
  const out = await sharp(buf)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer();
  return { buf: out, contentType: 'image/webp' };
}

async function uploadToBucket(folder, fileName, buf, contentType){
  const key = `${folder}/${fileName}`;
  const { error } = await sb.storage.from(BUCKET).upload(key, buf, {
    contentType,
    cacheControl: '31536000',
    upsert: true
  });
  if(error) throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

// ── PRODUCTS ────────────────────────────────────────────────────
async function migrateProducts(){
  console.log('\n📦 PRODUCTS');
  const { data: products, error } = await sb
    .from('products')
    .select('id, sku, img')
    .not('img', 'is', null);
  if(error) throw error;

  let migrated = 0, skipped = 0, failed = 0;
  for(const p of products){
    if(!p.img){ skipped++; continue; }
    if(isRemote(p.img)){ skipped++; continue; }

    const localPath = resolve(SITE_ROOT, p.img);
    try {
      const { buf, contentType } = await fileToWebp(localPath);
      const fname = `${slugify(p.sku || basename(p.img))}-${Date.now()}.webp`;
      if(DRY_RUN){
        console.log(`  [dry] ${p.sku.padEnd(8)} ${p.img} → media/products/${fname}`);
        migrated++;
        continue;
      }
      const url = await uploadToBucket('products', fname, buf, contentType);
      const { error: updErr } = await sb.from('products').update({ img: url }).eq('id', p.id);
      if(updErr) throw updErr;
      console.log(`  ✓ ${p.sku.padEnd(8)} ${url}`);
      migrated++;
    } catch(err){
      console.error(`  ✗ ${p.sku}: ${err.message}`);
      failed++;
    }
  }
  console.log(`\n  ${migrated} migrated · ${skipped} skipped · ${failed} failed`);
}

// ── FOUNDERS (στα site_sections) ─────────────────────────────────
async function migrateFounders(){
  console.log('\n👤 FOUNDERS');
  const { data, error } = await sb
    .from('site_sections')
    .select('id, items')
    .eq('kind', 'founders');
  if(error) throw error;
  if(!data || data.length === 0){
    console.log('  (καμία founders section)');
    return;
  }

  let migrated = 0, skipped = 0, failed = 0;
  for(const section of data){
    const items = Array.isArray(section.items) ? section.items : [];
    let changed = false;

    for(const f of items){
      if(!f.photo){ skipped++; continue; }
      if(isRemote(f.photo)){ skipped++; continue; }

      const localPath = resolve(SITE_ROOT, f.photo);
      try {
        const { buf, contentType } = await fileToWebp(localPath);
        const fname = `${slugify(f.name || 'founder')}-${Date.now()}.webp`;
        if(DRY_RUN){
          console.log(`  [dry] ${(f.name||'?').padEnd(18)} ${f.photo} → media/founders/${fname}`);
          migrated++;
          continue;
        }
        const url = await uploadToBucket('founders', fname, buf, contentType);
        f.photo = url;
        changed = true;
        console.log(`  ✓ ${(f.name||'?').padEnd(18)} ${url}`);
        migrated++;
      } catch(err){
        console.error(`  ✗ ${f.name || '?'}: ${err.message}`);
        failed++;
      }
    }

    if(changed && !DRY_RUN){
      const { error: updErr } = await sb.from('site_sections').update({ items }).eq('id', section.id);
      if(updErr) console.error(`  ⚠ section ${section.id} update failed: ${updErr.message}`);
    }
  }
  console.log(`\n  ${migrated} migrated · ${skipped} skipped · ${failed} failed`);
}

// ── RUN ─────────────────────────────────────────────────────────
console.log(DRY_RUN ? '🧪 DRY RUN — δεν γίνεται καμία αλλαγή' : '🚀 LIVE MIGRATION');
console.log(`📁 Site root: ${SITE_ROOT}`);
console.log(`🪣 Bucket:    ${BUCKET}`);

try {
  await migrateProducts();
  await migrateFounders();
  console.log('\n✅ Ολοκληρώθηκε');
} catch(err){
  console.error('\n💥 Migration failed:', err);
  process.exit(1);
}
