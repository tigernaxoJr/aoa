// Loads schemas/*.schema.json (shipped in the template zip, synced from the site) and validates documents.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

export const PROJECT_FILE = 'slide.project.json'
export const ACTIVITY_FILE = 'slide.activity.json'

export function loadSchemas(root) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
  addFormats(ajv)
  for (const name of ['project', 'activity']) {
    const file = join(root, 'schemas', `${name}.schema.json`)
    if (!existsSync(file)) throw new Error(`missing ${file}; re-download schemas/ from the template`)
    ajv.addSchema(JSON.parse(readFileSync(file, 'utf8')))
  }
  return { project: ajv.getSchema('project.schema.json'), activity: ajv.getSchema('activity.schema.json') }
}

/** Error messages for `doc`, empty when valid. */
export function schemaErrors(validate, doc) {
  return validate(doc) ? [] : validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`)
}

/** Writes JSON through a temp file and a rename, so readers never see a partial file. */
export function writeJsonAtomic(file, doc) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`)
  renameSync(tmp, file)
}
