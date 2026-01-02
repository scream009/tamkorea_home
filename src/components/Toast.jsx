import React, { useEffect } from 'react';
import './Toast.css';
import { Info } from 'lucide-react';

const Toast = ({ message, isVisible, onClose, duration = 3000 }) => {
    useEffect(() => {
        if (isVisible) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [isVisible, duration, onClose]);

    if (!isVisible) return null;

    return (
        <div className="toast-container">
            <div className="toast-content">
                <Info size={20} className="toast-icon" />
                <span>{message}</span>
            </div>
        </div>
    );
};

export default Toast;
