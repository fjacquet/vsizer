#!/usr/bin/env node
/**
 * Generate a synthetic RVTools-shaped sample workbook for the
 * "Charger un exemple" / "Load a sample" button on the empty landing page.
 *
 * The data is fabricated end to end — hostnames, cluster names, VM names
 * are generic placeholders. No real estate data is shipped (privacy
 * invariant, ADR-0001).
 *
 * Run: npm run generate-sample
 * Output: public/samples/rvtools-sample.xlsx
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '..', 'public', 'samples', 'rvtools-sample.xlsx')

// ---------------------------------------------------------------------------
// Synthetic estate
//
// Three clusters, sized to exercise every dashboard branch:
//   - prod-paris-01:    busy production       (4 hosts, dense, ~70 % CPU)
//   - prod-paris-02:    medium-loaded GP      (3 hosts,        ~45 % CPU)
//   - dr-amsterdam-01:  cold DR replica       (2 hosts,        ~15 % CPU)
//
// Memory and CPU usage percentages are RVTools-style integers (e.g. 68
// for "68 %"); the adapter's `toRatio` coerces them to 0..1.
// ---------------------------------------------------------------------------

/** @type {{name:string,cluster:string,cores:number,speedMhz:number,memoryMb:number,cpuPct:number,ramPct:number}[]} */
const hosts = [
  // prod-paris-01 — 4 hosts, 32 cores @ 2.4 GHz, 512 GiB each
  {
    name: 'esx-prd-par-01',
    cluster: 'prod-paris-01',
    cores: 32,
    speedMhz: 2400,
    memoryMb: 524288,
    cpuPct: 68,
    ramPct: 81,
  },
  {
    name: 'esx-prd-par-02',
    cluster: 'prod-paris-01',
    cores: 32,
    speedMhz: 2400,
    memoryMb: 524288,
    cpuPct: 64,
    ramPct: 79,
  },
  {
    name: 'esx-prd-par-03',
    cluster: 'prod-paris-01',
    cores: 32,
    speedMhz: 2400,
    memoryMb: 524288,
    cpuPct: 71,
    ramPct: 83,
  },
  {
    name: 'esx-prd-par-04',
    cluster: 'prod-paris-01',
    cores: 32,
    speedMhz: 2400,
    memoryMb: 524288,
    cpuPct: 66,
    ramPct: 78,
  },
  // prod-paris-02 — 3 hosts, 24 cores @ 2.9 GHz, 384 GiB each
  {
    name: 'esx-prd-par-05',
    cluster: 'prod-paris-02',
    cores: 24,
    speedMhz: 2900,
    memoryMb: 393216,
    cpuPct: 47,
    ramPct: 58,
  },
  {
    name: 'esx-prd-par-06',
    cluster: 'prod-paris-02',
    cores: 24,
    speedMhz: 2900,
    memoryMb: 393216,
    cpuPct: 43,
    ramPct: 54,
  },
  {
    name: 'esx-prd-par-07',
    cluster: 'prod-paris-02',
    cores: 24,
    speedMhz: 2900,
    memoryMb: 393216,
    cpuPct: 49,
    ramPct: 60,
  },
  // dr-amsterdam-01 — 2 hosts, 16 cores @ 3.0 GHz, 256 GiB each
  {
    name: 'esx-dr-ams-01',
    cluster: 'dr-amsterdam-01',
    cores: 16,
    speedMhz: 3000,
    memoryMb: 262144,
    cpuPct: 14,
    ramPct: 22,
  },
  {
    name: 'esx-dr-ams-02',
    cluster: 'dr-amsterdam-01',
    cores: 16,
    speedMhz: 3000,
    memoryMb: 262144,
    cpuPct: 16,
    ramPct: 25,
  },
]

/** @type {{name:string,cluster:string,vcpu:number,vramMb:number,on:boolean}[]} */
const vms = [
  // prod-paris-01 — 18 VMs, mostly powered on, web/db/cache/log mix
  { name: 'app-web-01', cluster: 'prod-paris-01', vcpu: 4, vramMb: 16384, on: true },
  { name: 'app-web-02', cluster: 'prod-paris-01', vcpu: 4, vramMb: 16384, on: true },
  { name: 'app-web-03', cluster: 'prod-paris-01', vcpu: 4, vramMb: 16384, on: true },
  { name: 'app-api-01', cluster: 'prod-paris-01', vcpu: 8, vramMb: 32768, on: true },
  { name: 'app-api-02', cluster: 'prod-paris-01', vcpu: 8, vramMb: 32768, on: true },
  { name: 'db-mssql-01', cluster: 'prod-paris-01', vcpu: 16, vramMb: 131072, on: true },
  { name: 'db-mssql-02', cluster: 'prod-paris-01', vcpu: 16, vramMb: 131072, on: true },
  { name: 'db-postgres-01', cluster: 'prod-paris-01', vcpu: 12, vramMb: 65536, on: true },
  { name: 'db-postgres-02', cluster: 'prod-paris-01', vcpu: 12, vramMb: 65536, on: true },
  { name: 'cache-redis-01', cluster: 'prod-paris-01', vcpu: 4, vramMb: 32768, on: true },
  { name: 'cache-redis-02', cluster: 'prod-paris-01', vcpu: 4, vramMb: 32768, on: true },
  { name: 'queue-rabbit-01', cluster: 'prod-paris-01', vcpu: 4, vramMb: 16384, on: true },
  { name: 'queue-rabbit-02', cluster: 'prod-paris-01', vcpu: 4, vramMb: 16384, on: true },
  { name: 'mon-grafana-01', cluster: 'prod-paris-01', vcpu: 2, vramMb: 8192, on: true },
  { name: 'mon-prometheus-01', cluster: 'prod-paris-01', vcpu: 4, vramMb: 32768, on: true },
  { name: 'log-elastic-01', cluster: 'prod-paris-01', vcpu: 8, vramMb: 65536, on: true },
  { name: 'log-elastic-02', cluster: 'prod-paris-01', vcpu: 8, vramMb: 65536, on: true },
  { name: 'tmpl-w2022-base', cluster: 'prod-paris-01', vcpu: 2, vramMb: 4096, on: false },

  // prod-paris-02 — 14 VMs, services + CI/CD + QA
  { name: 'svc-iam-01', cluster: 'prod-paris-02', vcpu: 4, vramMb: 16384, on: true },
  { name: 'svc-iam-02', cluster: 'prod-paris-02', vcpu: 4, vramMb: 16384, on: true },
  { name: 'svc-secrets-01', cluster: 'prod-paris-02', vcpu: 2, vramMb: 8192, on: true },
  { name: 'svc-billing-01', cluster: 'prod-paris-02', vcpu: 8, vramMb: 32768, on: true },
  { name: 'svc-billing-02', cluster: 'prod-paris-02', vcpu: 8, vramMb: 32768, on: true },
  { name: 'svc-mail-01', cluster: 'prod-paris-02', vcpu: 4, vramMb: 16384, on: true },
  { name: 'svc-storage-01', cluster: 'prod-paris-02', vcpu: 4, vramMb: 16384, on: true },
  { name: 'svc-cdn-01', cluster: 'prod-paris-02', vcpu: 4, vramMb: 8192, on: true },
  { name: 'jenkins-build-01', cluster: 'prod-paris-02', vcpu: 8, vramMb: 32768, on: true },
  { name: 'jenkins-agent-01', cluster: 'prod-paris-02', vcpu: 4, vramMb: 16384, on: true },
  { name: 'jenkins-agent-02', cluster: 'prod-paris-02', vcpu: 4, vramMb: 16384, on: true },
  { name: 'gitlab-prod-01', cluster: 'prod-paris-02', vcpu: 8, vramMb: 32768, on: true },
  { name: 'qa-db-01', cluster: 'prod-paris-02', vcpu: 4, vramMb: 16384, on: false },
  { name: 'qa-app-01', cluster: 'prod-paris-02', vcpu: 4, vramMb: 16384, on: false },

  // dr-amsterdam-01 — 8 VMs, mostly DR replicas (off)
  { name: 'dr-db-mssql-01', cluster: 'dr-amsterdam-01', vcpu: 16, vramMb: 131072, on: false },
  { name: 'dr-db-postgres-01', cluster: 'dr-amsterdam-01', vcpu: 12, vramMb: 65536, on: false },
  { name: 'dr-app-api-01', cluster: 'dr-amsterdam-01', vcpu: 8, vramMb: 32768, on: false },
  { name: 'dr-svc-iam-01', cluster: 'dr-amsterdam-01', vcpu: 4, vramMb: 16384, on: false },
  { name: 'dr-vcenter-01', cluster: 'dr-amsterdam-01', vcpu: 8, vramMb: 32768, on: true },
  { name: 'dr-jumpbox-01', cluster: 'dr-amsterdam-01', vcpu: 2, vramMb: 8192, on: true },
  { name: 'dr-backup-01', cluster: 'dr-amsterdam-01', vcpu: 4, vramMb: 16384, on: true },
  { name: 'dr-monitor-01', cluster: 'dr-amsterdam-01', vcpu: 2, vramMb: 8192, on: true },
]

// ---------------------------------------------------------------------------
// Workbook assembly
// Headers match the canonical RVTools English defaults the adapter expects
// (see src/engines/parser/adapters/rvtools.ts).
// ---------------------------------------------------------------------------

const vinfoRows = [
  ['VM', 'Cluster', 'CPUs', 'Memory', 'Powerstate'],
  ...vms.map((v) => [v.name, v.cluster, v.vcpu, v.vramMb, v.on ? 'poweredOn' : 'poweredOff']),
]

const vhostRows = [
  ['Host', 'Cluster', '# Cores', 'Speed', '# Memory', 'CPU usage %', 'Memory usage %'],
  ...hosts.map((h) => [h.name, h.cluster, h.cores, h.speedMhz, h.memoryMb, h.cpuPct, h.ramPct]),
]

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vinfoRows), 'vInfo')
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vhostRows), 'vHost')

mkdirSync(dirname(OUT), { recursive: true })
// SheetJS's `writeFile` in browser-build mode has no fs binding when imported
// from Node ESM, so we serialize to a buffer and write it ourselves.
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
writeFileSync(OUT, buf)

const clusters = new Set(hosts.map((h) => h.cluster))
console.log(`Wrote ${OUT}`)
console.log(`  ${hosts.length} hosts across ${clusters.size} clusters`)
console.log(`  ${vms.length} VMs (${vms.filter((v) => v.on).length} powered on)`)
