
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
        const { originalListing, analysis } = await req.json();

        if (!analysis || !originalListing) {
            return new Response('Missing required context in request body.', { status: 400 });
        }
        
        const prompt = `Based on the original product listing and the provided AI analysis, generate two distinct alternative options for the product's title and description for A/B testing purposes.

        Original Listing: "${originalListing}"
        AI Analysis: ${JSON.stringify(analysis, null, 2)}

        Return the response as a single JSON object with the key "variations" which is an array of objects. Each object should have a "title" and a "description" key.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        variations: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    description: { type: Type.STRING }
                                },
                                required: ["title", "description"]
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
        console.error('API/ab-test failed:', error);
        return new Response('Error processing your request.', { status: 500 });
    }
}