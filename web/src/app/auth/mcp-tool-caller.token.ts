// mcp-tool-caller.token.ts
import { InjectionToken } from '@angular/core';

/**
 * Puente hacia el cliente MCP que ya use la aplicación host.
 * Su implementación debe llamar la herramienta indicada con argumentos vacíos
 * y devolver la respuesta de tools/call; este contrato no define el transporte.
 */
export interface McpToolCallResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
  isError: boolean;
}

export interface McpToolCaller {
  callTool(
    name: 'test_local_write_permission',
    args: Record<string, never>
  ): Promise<McpToolCallResponse>;
}

export const MCP_TOOL_CALLER = new InjectionToken<McpToolCaller>(
  'MCP_TOOL_CALLER'
);