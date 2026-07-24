export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function notFound(message = 'Recurso no encontrado'): ApiError {
  return new ApiError(404, 'not_found', message);
}
