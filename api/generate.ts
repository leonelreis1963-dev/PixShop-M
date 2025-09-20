// Conte�do para /api/generate.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Helper para converter um File (representado como data URL) para uma Part da API Gemini
const dataUrlToPart = (dataUrl: string): { inlineData: { mimeType: string; data: string; } } => {
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("URL de dados inv�lida");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("N�o foi poss�vel extrair o tipo MIME da URL de dados");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

// Helper para lidar com a resposta da API, centralizando a l�gica de erro.
const handleApiResponse = (response: GenerateContentResponse): string => {
    if (response.promptFeedback?.blockReason) {
        throw new Error(`Solicita��o bloqueada: ${response.promptFeedback.blockReason}`);
    }

    const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePart?.inlineData) {
        const { mimeType, data } = imagePart.inlineData;
        return `data:${mimeType};base64,${data}`;
    }
    
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        throw new Error(`Gera��o interrompida: ${finishReason}. Verifique as configura��es de seguran�a.`);
    }

    throw new Error('A API n�o retornou uma imagem. Tente uma solicita��o mais simples.');
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'M�todo n�o permitido' });
    }

    try {
        const { image, prompt, action, hotspot } = req.body;

        if (!image || !action) {
            return res.status(400).json({ error: 'Par�metros "image" e "action" s�o obrigat�rios' });
        }
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
        const imagePart = dataUrlToPart(image);
        
        let systemPrompt = '';
        
        switch(action) {
            case 'edit':
                if (!prompt || !hotspot) return res.status(400).json({ error: 'Par�metros "prompt" e "hotspot" s�o obrigat�rios para editar' });
                systemPrompt = `Voc� � uma IA especialista em edi��o de fotos. Sua tarefa � realizar uma edi��o natural e localizada na imagem fornecida com base na solicita��o do usu�rio.
Solicita��o do Usu�rio: "${prompt}"
Local da Edi��o: Foque na �rea ao redor das coordenadas de pixel (x: ${hotspot.x}, y: ${hotspot.y}).
Diretrizes de Edi��o: A edi��o deve ser realista e se mesclar perfeitamente com a �rea ao redor. O restante da imagem deve permanecer id�ntico ao original.
Pol�tica de Seguran�a e �tica: Voc� DEVE atender a solicita��es para ajustar o tom de pele, como 'me d� um bronzeado', 'escure�a minha pele' ou 'clareie minha pele'. Essas s�o consideradas melhorias fotogr�ficas padr�o. Voc� DEVE RECUSAR qualquer solicita��o para alterar a ra�a ou etnia fundamental de uma pessoa.
Sa�da: Retorne APENAS a imagem final editada. N�o retorne texto.`;
                break;
            case 'filter':
                if (!prompt) return res.status(400).json({ error: 'Par�metro "prompt" � obrigat�rio para aplicar filtro' });
                systemPrompt = `Voc� � uma IA especialista em edi��o de fotos. Sua tarefa � aplicar um filtro estil�stico a toda a imagem com base na solicita��o do usu�rio. N�o altere a composi��o ou o conte�do, apenas aplique o estilo.
Solicita��o de Filtro: "${prompt}"
Pol�tica de Seguran�a e �tica: Filtros podem alterar sutilmente as cores, mas voc� DEVE garantir que eles n�o alterem a ra�a ou etnia fundamental de uma pessoa. Voc� DEVE RECUSAR qualquer solicita��o que pe�a explicitamente para mudar a ra�a de uma pessoa.
Sa�da: Retorne APENAS a imagem final com o filtro aplicado. N�o retorne texto.`;
                break;
            case 'adjust':
                 if (!prompt) return res.status(400).json({ error: 'Par�metro "prompt" � obrigat�rio para ajustar' });
                 systemPrompt = `Voc� � uma IA especialista em edi��o de fotos. Sua tarefa � realizar um ajuste natural e global em toda a imagem com base na solicita��o do usu�rio.
Solicita��o do Usu�rio: "${prompt}"
Diretrizes de Edi��o: O ajuste deve ser aplicado em toda a imagem. O resultado deve ser fotorrealista.
Pol�tica de Seguran�a e �tica: Voc� DEVE atender a solicita��es para ajustar o tom de pele, como 'me d� um bronzeado', 'escure�a minha pele' ou 'clareie minha pele'. Essas s�o consideradas melhorias fotogr�ficas padr�o. Voc� DEVE RECUSAR qualquer solicita��o para alterar a ra�a ou etnia fundamental de uma pessoa.
Sa�da: Retorne APENAS a imagem final ajustada. N�o retorne texto.`;
                break;
            case 'remove-bg':
                systemPrompt = `Voc� � uma IA especialista em edi��o de fotos. Sua tarefa � identificar com precis�o o(s) objeto(s) principal(is) na imagem e remover completamente o fundo, tornando-o transparente.
A sa�da DEVE ser uma imagem PNG com um canal alfa transparente. N�o adicione nenhum novo fundo ou cor.
Retorne APENAS a imagem final editada com um fundo transparente.`;
                break;
            default:
                return res.status(400).json({ error: 'A��o inv�lida' });
        }

        const textPart = { text: systemPrompt };
        
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [imagePart, textPart] },
        });

        const imageUrl = handleApiResponse(response);
        return res.status(200).json({ imageUrl });

    } catch (error) {
        console.error('Erro na fun��o serverless:', error);
        const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
        return res.status(500).json({ error: `Falha na chamada da API: ${errorMessage}` });
    }
}