import { FieldValidate } from './enums'
import { Field, isField } from './field'
import { isNumber, isPromise, isString, isUndefined, mapValues } from './utils'

export type ValidatorFields<T> = { [P in keyof T]: T[P] extends Field ? T[P]['value'] : T[P] extends Validator<any> ? ValidatorFields<T[P]> : any }

export const isValidator = (value: any): value is Validator<any> => value.constructor === Validator

export const validatorPolicy: Record<FieldValidate, (params: Field) => boolean> = {
  isString: (field: Field) => isString(field.value),
  isNumber: (field: Field) => isNumber(field.value),
  isArray: (field: Field) => !!field,
  min: (field: Field) => !!(field && isNumber(field.value) && field.value > Number(field._min)),
  max: (field: Field) => !!(field && isNumber(field.value) && field.value < Number(field._max)),
  maxLength: (field: Field) => validatorPolicy.isArray(field.value) && field.value.length < Number(field._maxLength),
  required: (field: Field) => !isUndefined(field.value)
}

export const validateFeilds = <T extends Record<string, any>>(fields: T): Promise<void> => {
  let valid = true
  let isDeep = false
  let hasAsyncValidator = false

  let error: any

  return new Promise((resolve, reject) => {
    for (const [key, field] of Object.entries(fields)) {
      if (isField(field)) {
        if (!field._required && isUndefined(field.value)) { continue }

        for (const step of field.chains) {
          if (!validatorPolicy[step](fields[key])) {
            valid = false
            break
          }
        }

        for (const v of field._validators) {
          const res = v(field.value)

          if (!isPromise(res) && !res) {
            valid = false
          }

          if (isPromise(res)) {
            hasAsyncValidator = true
            res.then((promiseRes) => {
              if (!promiseRes) {
                valid = false
                reject(valid)
              }
            })
          }
        }

        if (!valid) {
          error = field._message || field
          break
        }
      }

      if (isValidator(field)) {
        isDeep = true
        field.validate().then(resolve).catch(() => {
          valid = false
          reject(valid)
        })
      }
    }

    if (!isDeep && !hasAsyncValidator) { valid ? resolve() : reject(error) }
  })
}

export class Validator<T extends Record<string, any>> {
  public _fields: T

  constructor (getter: () => T) {
    this._fields = getter()
  }

  validate (): Promise<void> {
    return validateFeilds(this._fields)
  }

  get value () {
    const fields: Record<string, any> = mapValues(this._fields, (field: any) => {
      if (isField(field)) { return field.value }
      if (isValidator(field)) { return field.value }

      return field
    })

    return new Proxy(fields as ValidatorFields<T>, {
      get: (target, key: string) => {
        return target[key]
      },
      set: (target: Record<string, any>, key: string, value) => {
        target[key] = value
        this._fields[key].value = value
        return true
      }
    })
  }
}
