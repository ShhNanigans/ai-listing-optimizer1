
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export default async function handler(req: Request) {
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    try {
        const { analysis } = await req.json();

        if (!analysis) {
            return new Response('Missing analysis context.', { status: 400 });
        }

        const optimizedTitle = analysis.recommendations.find(r => r.element === 'Title')?.suggestion;
        const optimizedDescription = analysis.recommendations.find(r => r.element === 'Description')?.suggestion;

        const prompt = `You are a social media and email marketing expert. Based on the following optimized product information, create promotional content.

        Product Title: "${optimizedTitle}"
        Product Description: "${optimizedDescription}"

        Generate a concise and engaging Instagram post (including hashtags) and a short, persuasive promotional email.
        Return the response as a single JSON object with keys "instagram_post" and "promotional_email".
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        instagram_post: { type: Type.STRING },
                        promotional_email: { type: Type.STRING }
                    },
                    required: ["instagram_post", "promotional_email"]
                }
            }
        });

        return new Response(response.text, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('API/promo failed:', error);
        return new Response('Error processing your request.', { status: 500 });
    }
}