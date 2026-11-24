<?php

declare(strict_types=1);

namespace App\Modules\Kyc;

use PDO;

/**
 * Contrato de una API de autenticación de personas (KYC externo).
 *
 * En modo demo el resultado es determinista y no llama a nadie: sirve para
 * probar el flujo. Con un proveedor real (Idwall, Ver-Identidad, InCode…)
 * se implementa esta misma interfaz y se conecta desde .env.
 */
interface VerificadorIdentidadInterface
{
    /**
     * Verifica el documento. Devuelve coincidencia y puntaje de confianza.
     *
     * @return array{resultado:'coincide'|'no_coincide'|'error', puntaje:?int, respuesta:array<string,mixed>}
     */
    public function verificar(string $tipo, string $rutaArchivo): array;
}

/**
 * Verificador demo: coincide si el documento es imagen y no está vacío.
 * La respuesta es plausibe y queda auditada en kyc_verificaciones_ext.
 */
final class VerificadorDemo implements VerificadorIdentidadInterface
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function verificar(string $tipo, string $rutaArchivo): array
    {
        $ruta = __DIR__ . '/../../../storage/kyc/' . basename($rutaArchivo);
        $existe = is_file($ruta) && filesize($ruta) > 100;

        return [
            'resultado' => $existe ? 'coincide' : 'no_coincide',
            'puntaje'   => $existe ? 87 : 0,
            'respuesta' => [
                'proveedor' => 'demo',
                'documento' => $tipo,
                'ocr' => $existe ? ['leyo' => true] : ['leyo' => false],
            ],
        ];
    }
}

/**
 * Servicio que conecta el verificador con la tabla de resultados externos.
 */
final class VerificacionExtService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly VerificadorIdentidadInterface $verificador,
    ) {
    }

    /**
     * Llama al verificador para un documento y guarda el resultado.
     * Un mismo documento se verifica una sola vez (idempotente).
     */
    public function verificarDocumento(int $documentoId): array
    {
        $stmt = $this->pdo->prepare('SELECT id FROM kyc_verificaciones_ext WHERE documento_id = ? LIMIT 1');
        $stmt->execute([$documentoId]);

        if ($stmt->fetchColumn() !== false) {
            return ['ok' => true, 'mensaje' => 'Ya verificado.'];
        }

        $stmt = $this->pdo->prepare('SELECT tipo, ruta_archivo FROM kyc_documentos WHERE id = ? LIMIT 1');
        $stmt->execute([$documentoId]);
        $doc = $stmt->fetch();

        if ($doc === false) {
            return ['ok' => false, 'mensaje' => 'Documento no encontrado.'];
        }

        $r = $this->verificador->verificar((string) $doc['tipo'], (string) $doc['ruta_archivo']);

        $this->pdo->prepare(
            'INSERT INTO kyc_verificaciones_ext (documento_id, proveedor, resultado, puntaje, respuesta)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([
            $documentoId,
            'demo',
            $r['resultado'],
            $r['puntaje'],
            json_encode($r['respuesta'], JSON_UNESCAPED_UNICODE),
        ]);

        return ['ok' => true, 'resultado' => $r['resultado'], 'puntaje' => $r['puntaje']];
    }
}
