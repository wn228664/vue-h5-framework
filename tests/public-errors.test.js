/** 验证面向用户和诊断的错误字段过滤，防止对象转字符串或原始请求数据泄露。 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getErrorInfo, getErrorMessage } from '../src/utils/errors.js'

/**
 * 断言非法 message 使用兜底文本，合法字符串与 Error 文本正常展示。
 */
test('public messages reject object, missing and blank error fields', () => {
  // failure：缺失、空白或非文本 message 的错误输入集合成员。
  for (const failure of [null, undefined, { message: {} }, { message: 42 }, { message: '  ' }])
    assert.equal(getErrorMessage(failure, 'fallback'), 'fallback')
  assert.equal(getErrorMessage('plain'), 'plain')
  assert.equal(getErrorMessage(new Error('retry')), 'retry')
})

/**
 * 断言诊断只保留经过类型过滤的名称和代码，不携带原始错误。
 */
test('diagnostics never retain raw errors or non-text public fields', () => {
  // error：带敏感形状字段的错误替身，诊断结果不能保留这些原始对象。
  const error = {
    name: { token: 'private' },
    code: { response: 'private' },
    config: { Authorization: 'private' }
  }
  assert.deepEqual(getErrorInfo(error), { name: 'Error', code: undefined })
  assert.equal(JSON.stringify(getErrorInfo(error)).includes('private'), false)
  assert.deepEqual(getErrorInfo({ name: 'NetworkError', code: 'OFFLINE' }), {
    name: 'NetworkError',
    code: 'OFFLINE'
  })
})
