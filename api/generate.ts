// Conteúdo para /api/generate.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Helper para converter um File (representado como data URL) para uma Part da API Gemini
const dataUrlToPart = (dataUrl: string): { inlineData: { mimeType: string; data: string; } } => {
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("URL de dados inválida");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Não foi possível extrair o tipo MIME da URL de dados");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

// Helper para lidar com a resposta da API, centralizando a lógica de erro.
const handleApiResponse = (response: GenerateContentResponse): string => {
    if (response.promptFeedback?.blockReason) {
        throw new Error(`Solicitação bloqueada: ${response.promptFeedback.blockReason}`);
    }

    const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePart?.inlineData) {
        const { mimeType, data } = imagePart.inlineData;
        return `data:${mimeType};base64,${data}`;
    }
    
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        throw new Error(`Geração interrompida: ${finishReason}. Verifique as configurações de segurança.`);
    }

    throw new Error('A API não retornou uma imagem. Tente uma solicitação mais simples.');
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { image, prompt, action, hotspot } = req.body;

        if (!image || !action) {
            return res.status(400).json({ error: 'Parâmetros "image" e "action" são obrigatórios' });
        }
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        const imagePart = dataUrlToPart(image);
        
        let systemPrompt = '';
        
        switch(action) {
            case 'edit':
                if (!prompt || !hotspot) return res.status(400).json({ error: 'Parâmetros "prompt" e "hotspot" são obrigatórios para editar' });
                systemPrompt = `Você é uma IA especialista em edição de fotos. Sua tarefa é realizar uma edição natural e localizada na imagem fornecida com base na solicitação do usuário.
Solicitação do Usuário: "${prompt}"
Local da Edição: Foque na área ao redor das coordenadas de pixel (x: ${hotspot.x}, y: ${hotspot.y}).
Diretrizes de Edição: A edição deve ser realista e se mesclar perfeitamente com a área ao redor. O restante da imagem deve permanecer idêntico ao original.
Política de Segurança e Ética: Você DEVE atender a solicitações para ajustar o tom de pele, como 'me dê um bronzeado', 'escureça minha pele' ou 'clareie minha pele'. Essas são consideradas melhorias fotográficas padrão. Você DEVE RECUSAR qualquer solicitação para alterar a raça ou etnia fundamental de uma pessoa.
Saída: Retorne APENAS a imagem final editada. Não retorne texto.`;
                break;
            case 'filter':
                if (!prompt) return res.status(400).json({ error: 'Parâmetro "prompt" é obrigatório para aplicar filtro' });
                systemPrompt = `Você é uma IA especialista em edição de fotos. Sua tarefa é aplicar um filtro estilístico a toda a imagem com base na solicitação do usuário. Não altere a composição ou o conteúdo, apenas aplique o estilo.
Solicitação de Filtro: "${prompt}"
Política de Segurança e Ética: Filtros podem alterar sutilmente as cores, mas você DEVE garantir que eles não alterem a raça ou etnia fundamental de uma pessoa. Você DEVE RECUSAR qualquer solicitação que peça explicitamente para mudar a raça de uma pessoa.
Saída: Retorne APENAS a imagem final com o filtro aplicado. Não retorne texto.`;
                break;
            case 'adjust':
                 if (!prompt) return res.status(400).json({ error: 'Parâmetro "prompt" é obrigatório para ajustar' });
                 systemPrompt = `Você é uma IA especialista em edição de fotos. Sua tarefa é realizar um ajuste natural e global em toda a imagem com base na solicitação do usuário.
Solicitação do Usuário: "${prompt}"
Diretrizes de Edição: O ajuste deve ser aplicado em toda a imagem. O resultado deve ser fotorrealista.
Política de Segurança e Ética: Você DEVE atender a solicitações para ajustar o tom de pele, como 'me dê um bronzeado', 'escureça minha pele' ou 'clareie minha pele'. Essas são consideradas melhorias fotográficas padrão. Você DEVE RECUSAR qualquer solicitação para alterar a raça ou etnia fundamental de uma pessoa.
Saída: Retorne APENAS a imagem final ajustada. Não retorne texto.`;
                break;
            case 'remove-bg':
                systemPrompt = `Você é uma IA especialista em edição de fotos. Sua tarefa é identificar com precisão o(s) objeto(s) principal(is) na imagem e remover completamente o fundo, tornando-o transparente.
A saída DEVE ser uma imagem PNG com um canal alfa transparente. Não adicione nenhum novo fundo ou cor.
Retorne APENAS a imagem final editada com um fundo transparente.`;
                break;
            default:
                return res.status(400).json({ error: 'Ação inválida' });
        }

        const textPart = { text: systemPrompt };
        
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [imagePart, textPart] },
        });

        const imageUrl = handleApiResponse(response);
        return res.status(200).json({ imageUrl });

    } catch (error) {
        console.error('Erro na função serverless:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
        return res.status(500).json({ error: `Falha na chamada da API: ${errorMessage}` });
    }
}