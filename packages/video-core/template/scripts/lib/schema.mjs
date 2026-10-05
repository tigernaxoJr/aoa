// JSON Schema validation against the protocol files synced into <root>/schemas/.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { UsageError, readJson } from './project.mjs'

const SCHEMAS = ['common', 'project', 'scene', 'workflow']

export function loadSchemas(root) {
  const dir = join(root, 'schemas')
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
  addFormats(ajv)
  for (const name of SCHEMAS) {
    const file = join(dir, `${name}.schema.json`)
    if (!existsSync(file)) throw new UsageError(`missing ${file}; re-sync schemas/ from the template`)
    ajv.addSchema(readJson(file))
  }
  const workflowFile = join(dir, 'workflow.json')
  if (!existsSync(workflowFile)) throw new UsageError(`missing ${workflowFile}; re-sync schemas/ from the template`)
  return {
    project: ajv.getSchema('project.schema.json'),
    scene: ajv.getSchema('scene.schema.json'),
    workflow: readJson(workflowFile),
  }
}

/** Runs a compiled validator and returns human-readable error lines (empty when valid). */
export function schemaErrors(validate, data) {
  if (validate(data)) return []
  return validate.errors.map((e) => {
    const where = e.instancePath || '/'
    const extra = e.params?.additionalProperty ?? e.params?.unevaluatedProperty
    return extra ? `${where} has unknown field "${extra}"` : `${where} ${e.message}`
  })
}
