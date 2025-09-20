/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';

interface RemoveBgPanelProps {
  onRemoveBackground: () => void;
  isLoading: boolean;
}

const RemoveBgPanel: React.FC<RemoveBgPanelProps> = ({ onRemoveBackground, isLoading }) => {
  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-6 flex flex-col items-center gap-4 animate-fade-in backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-center text-gray-300">Remover Fundo</h3>
      <p className="text-sm text-gray-400 text-center max-w-md">
        Detecte automaticamente o objeto principal e remova o fundo, deixando uma tela transparente. Perfeito para criar recortes.
      </p>
      <button
        onClick={onRemoveBackground}
        className="w-full max-w-xs mt-2 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
        disabled={isLoading}
      >
        Remover Fundo
      </button>
    </div>
  );
};

export default RemoveBgPanel;