// local-write-permission-test.component.ts
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  CleanupResult,
  LocalWritePermissionApiError,
  LocalWritePermissionApiService,
  LocalWritePermissionResult,
  WritePermissionResult
} from './local-write-permission-api.service';

type ViewState = 'empty' | 'loading' | 'result' | 'error';

@Component({
  selector: 'app-local-write-permission-test',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './local-write-permission-test.component.html',
  styleUrls: ['./local-write-permission-test.component.css']
})
export class LocalWritePermissionTestComponent {
  state: ViewState = 'empty';
  result: LocalWritePermissionResult | null = null;
  errorMessage = '';

  constructor(private readonly api: LocalWritePermissionApiService) {}

  get isLoading(): boolean {
    return this.state === 'loading';
  }

  async runTest(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.state = 'loading';
    this.result = null;
    this.errorMessage = '';

    try {
      this.result = await this.api.run();
      this.state = 'result';
    } catch (error: unknown) {
      this.state = 'error';
      this.errorMessage = this.getErrorMessage(error);
    }
  }

  resultTitle(result: WritePermissionResult): string {
    switch (result) {
      case 'ALLOWED':
        return 'Escritura permitida';
      case 'DENIED':
        return 'Escritura denegada';
      case 'ERROR':
        return 'No se pudo determinar el permiso';
    }
  }

  resultDescription(result: WritePermissionResult): string {
    switch (result) {
      case 'ALLOWED':
        return 'El servidor pudo escribir en el directorio configurado.';
      case 'DENIED':
        return 'El servidor no pudo escribir en el directorio configurado.';
      case 'ERROR':
        return 'La prueba encontró un error y no pudo determinar el permiso.';
    }
  }

  cleanupDescription(cleanup: CleanupResult): string {
    switch (cleanup) {
      case 'COMPLETED':
        return 'El archivo temporal se eliminó.';
      case 'FAILED':
        return 'No se pudo confirmar la eliminación; podría quedar un archivo temporal.';
      case 'NOT_REQUIRED':
        return 'No hubo un archivo temporal que requiriera limpieza.';
    }
  }

  private getErrorMessage(error: unknown): string {
    if (!(error instanceof LocalWritePermissionApiError)) {
      return 'No se pudo completar la prueba. Inténtalo de nuevo o contacta al responsable del laboratorio.';
    }

    switch (error.reason) {
      case 'transport':
        return 'No se pudo contactar con el servidor MCP. Comprueba la conexión e inténtalo de nuevo.';
      case 'tool-error':
        return 'El servidor MCP rechazó la ejecución. Comprueba que la herramienta esté habilitada y configurada.';
      case 'invalid-response':
        return 'La respuesta del servidor no tiene el formato esperado; no se puede mostrar un resultado fiable.';
    }
  }
}