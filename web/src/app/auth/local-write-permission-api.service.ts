// local-write-permission-api.service.ts
import { inject, Injectable } from '@angular/core';
import { MCP_TOOL_CALLER } from './mcp-tool-caller.token';

export type WritePermissionResult = 'ALLOWED' | 'DENIED' | 'ERROR';
export type CleanupResult = 'COMPLETED' | 'FAILED' | 'NOT_REQUIRED';

export interface LocalWritePermissionResult {
  schemaVersion: '1';
  testId: string;
  checkedAt: string;
  result: WritePermissionResult;
  writePermission: boolean | null;
  cleanup: CleanupResult;
  code?: string;
}

export type ApiFailureReason =
  | 'transport'
  | 'tool-error'
  | 'invalid-response';

export class LocalWritePermissionApiError extends Error {
  constructor(public readonly reason: ApiFailureReason) {
    super('No se pudo obtener un resultado válido de la prueba.');
    this.name = 'LocalWritePermissionApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class LocalWritePermissionApiService {
  private readonly caller = inject(MCP_TOOL_CALLER);

  async run(): Promise<LocalWritePermissionResult> {
    let rawResponse: unknown;

    try {
      rawResponse = await this.caller.callTool(
        'test_local_write_permission',
        {}
      );
    } catch {
      throw new LocalWritePermissionApiError('transport');
    }

    if (!isRecord(rawResponse) || typeof rawResponse['isError'] !== 'boolean') {
      throw new LocalWritePermissionApiError('invalid-response');
    }

    if (rawResponse['isError'] === true) {
      throw new LocalWritePermissionApiError('tool-error');
    }

    const content = rawResponse['content'];
    if (!Array.isArray(content)) {
      throw new LocalWritePermissionApiError('invalid-response');
    }

    const textBlock = content.find(
      (item: unknown) =>
        isRecord(item) &&
        item['type'] === 'text' &&
        typeof item['text'] === 'string'
    );

    if (!isRecord(textBlock) || typeof textBlock['text'] !== 'string') {
      throw new LocalWritePermissionApiError('invalid-response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock['text']);
    } catch {
      throw new LocalWritePermissionApiError('invalid-response');
    }

    if (!isValidResult(parsed)) {
      throw new LocalWritePermissionApiError('invalid-response');
    }

    return parsed;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidResult(value: unknown): value is LocalWritePermissionResult {
  if (!isRecord(value)) {
    return false;
  }

  const validResult =
    value['result'] === 'ALLOWED' ||
    value['result'] === 'DENIED' ||
    value['result'] === 'ERROR';

  const validCleanup =
    value['cleanup'] === 'COMPLETED' ||
    value['cleanup'] === 'FAILED' ||
    value['cleanup'] === 'NOT_REQUIRED';

  const validPermission =
    typeof value['writePermission'] === 'boolean' ||
    value['writePermission'] === null;

  const validCode =
    !('code' in value) ||
    (typeof value['code'] === 'string' && value['code'].length > 0);

  const checkedAt =
    typeof value['checkedAt'] === 'string' &&
    value['checkedAt'].length > 0 &&
    !Number.isNaN(Date.parse(value['checkedAt']));

  if (
    value['schemaVersion'] !== '1' ||
    typeof value['testId'] !== 'string' ||
    value['testId'].length === 0 ||
    !checkedAt ||
    !validResult ||
    !validCleanup ||
    !validPermission ||
    !validCode
  ) {
    return false;
  }

  if (
    value['result'] === 'ALLOWED' &&
    value['writePermission'] !== true
  ) {
    return false;
  }

  if (
    value['result'] === 'DENIED' &&
    value['writePermission'] !== false
  ) {
    return false;
  }

  return true;
}