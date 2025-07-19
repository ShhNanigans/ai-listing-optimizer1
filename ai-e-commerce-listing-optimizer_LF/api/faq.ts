
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

        const prompt = `You are an expert e-commerce copywriter. Based on the provided product information, generate a list of 3-5 frequently asked questions (FAQs) that a potential buyer might have. Provide a clear and concise answer for each question.

        Product Title: "${optimizedTitle}"
        Product Description: "${optimizedDescription}"

        Return the response as a single JSON object with the key "faqs" which is an array of objects. Each object should have a "question" and "answer" key.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        faqs: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    question: { type: Type.STRING },
                                    answer: { type: Type.STRING }
                                },
                                required: ["question", "answer"]
                            }
                        }
                    }
                }
            }
        });

        return new Response(response.text, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('API/faq failed:', error);
        return new Response('Error processing your request.', { status: 500 });
    }
}
    