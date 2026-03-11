import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2 } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';

interface Message {
    id: string;
    role: 'bot' | 'user';
    text: string;
    timestamp: Date;
}

export const ChatbotAsistente: React.FC = () => {
    const { tenant } = useTenant();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', role: 'bot', text: `¡Hola! Soy tu asistente de ${tenant?.name || 'NeuraCore'}. ¿En qué te puedo ayudar hoy?`, timestamp: new Date() }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isTyping) return;

        const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input.trim(), timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const webhookUrl = 'https://n8n.neuracall.net/webhook-test/neuracore-chat'; 
            
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chatInput: userMsg.text,
                    tenant_id: tenant?.id // Dato VITAL para la seguridad en n8n
                })
            });

            if (!response.ok) {
                throw new Error('Error en la respuesta del webhook');
            }

            const data = await response.text(); // n8n suele devolver el texto plano directo si el Respond node es simple

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                text: data || 'No recibí respuesta del servidor.',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, botMsg]);

        } catch (error) {
            console.error('Error enviando mensaje al bot:', error);
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                text: 'Perdón, tuve un problema de conexión. ¿Podés intentar de nuevo?',
                timestamp: new Date()
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '1rem'
        }}>
            {/* Chat Window */}
            {isOpen && (
                <div className="card" style={{
                    width: '380px',
                    height: '500px',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: 'var(--shadow-lg), 0 10px 40px rgba(0,0,0,0.1)',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    animation: 'slideUp 0.3s ease-out'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '1rem',
                        background: 'var(--color-accent)',
                        color: 'black',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: 'white', padding: '0.4rem', borderRadius: '50%' }}>
                                <Bot size={20} color="var(--color-accent)" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Asistente Neura</h3>
                                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.8 }}>Conectado al ERP</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setIsOpen(false)}
                            style={{ background: 'transparent', border: 'none', color: 'black', cursor: 'pointer', opacity: 0.7, padding: '0.25rem' }}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div style={{
                        flex: 1,
                        padding: '1rem',
                        overflowY: 'auto',
                        background: 'var(--color-bg)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem'
                    }}>
                        {messages.map(msg => (
                            <div key={msg.id} style={{
                                display: 'flex',
                                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                                gap: '0.75rem',
                                alignItems: 'flex-end'
                            }}>
                                <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    background: msg.role === 'user' ? 'var(--color-text-primary)' : 'var(--color-accent)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    {msg.role === 'user' ? <User size={14} color="var(--color-bg)" /> : <Bot size={14} color="black" />}
                                </div>
                                <div style={{
                                    background: msg.role === 'user' ? 'var(--color-bg-elevated)' : 'var(--color-bg-secondary)',
                                    color: 'var(--color-text)',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '1rem',
                                    borderBottomRightRadius: msg.role === 'user' ? '4px' : '1rem',
                                    borderBottomLeftRadius: msg.role === 'bot' ? '4px' : '1rem',
                                    maxWidth: '80%',
                                    fontSize: '0.9rem',
                                    lineHeight: 1.4,
                                    border: msg.role === 'user' ? '1px solid var(--color-border)' : 'none'
                                }}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Bot size={14} color="black" />
                                </div>
                                <div style={{ background: 'var(--color-bg-secondary)', padding: '0.75rem 1rem', borderRadius: '1rem', borderBottomLeftRadius: '4px' }}>
                                    <Loader2 size={16} className="spin" color="var(--color-text-muted)" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div style={{ padding: '1rem', background: 'var(--color-bg-elevated)', borderTop: '1px solid var(--color-border-subtle)' }}>
                        <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                placeholder="Consultá facturas, pagos..."
                                className="form-input"
                                style={{ flex: 1, borderRadius: '2rem', paddingLeft: '1.25rem' }}
                                disabled={isTyping}
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || isTyping}
                                style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '50%',
                                    background: input.trim() && !isTyping ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                                    color: input.trim() && !isTyping ? 'black' : 'var(--color-text-muted)',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: input.trim() && !isTyping ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <Send size={18} style={{ marginLeft: '2px' }} />
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Floating Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'var(--color-accent)',
                    color: 'black',
                    border: 'none',
                    boxShadow: 'var(--shadow-lg)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s ease, background-color 0.2s ease',
                    transform: isOpen ? 'scale(0.9)' : 'scale(1)',
                }}
                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseOut={e => e.currentTarget.style.transform = isOpen ? 'scale(0.9)' : 'scale(1)'}
            >
                {isOpen ? <X size={28} /> : <MessageSquare size={28} />}
            </button>

            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};
