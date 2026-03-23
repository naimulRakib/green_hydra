import React from 'react';
import { Crown, Microscope, Code, User, GraduationCap } from 'lucide-react';

export default function TeamIntroduction() {
    return (
        <div className="flex flex-col h-full animate-fade-in w-full">
            {/* Header Section */}
            <div className="text-center mb-16">
                <h2 className="text-5xl font-bold text-white mb-6 border-b-4 border-green-500 pb-4 inline-block w-fit">
                    টিম পরিচিতি (Team Introduction)
                </h2>
                <div className="flex flex-col items-center justify-center">
                    <h3 className="text-4xl font-extrabold text-green-400 drop-shadow-md">Team Green Hydra</h3>
                    <p className="text-2xl text-gray-300 mt-3 flex items-center gap-2 bg-gray-800/80 px-6 py-2 rounded-full border border-gray-700">
                        <GraduationCap className="w-8 h-8 text-blue-400" />
                        Bangladesh University of Engineering and Technology (BUET)
                    </p>
                </div>
            </div>

            {/* Team Members Grid */}
            <div className="flex justify-center gap-16 flex-1 items-center">

                {/* Team Leader Card: Naimul Islam */}
                <div className="bg-gray-800/80 p-10 rounded-3xl border-2 border-green-500 flex flex-col items-center w-[420px] relative shadow-[0_0_40px_rgba(34,197,94,0.15)] hover:shadow-[0_0_50px_rgba(34,197,94,0.3)] transition-all transform hover:-translate-y-2">
                    <div className="absolute -top-6 bg-gradient-to-r from-green-600 to-green-500 text-white px-8 py-2 rounded-full font-bold text-lg flex items-center gap-2 shadow-lg border border-green-400">
                        <Crown className="w-6 h-6 text-yellow-300" /> Team Leader
                    </div>

                    {/* Naimul's Image Container */}
                    <div className="w-56 h-56 rounded-full border-4 border-green-500/50 overflow-hidden mb-6 mt-4 bg-gray-900 flex items-center justify-center shadow-inner">
                        <img
                            src="/images/naimul.jpg"
                            alt="Naimul Islam"
                            className="w-full h-full object-cover"
                        // Just delete the onError block!
                        />
                    </div>

                    <h4 className="text-4xl font-bold text-white mb-2 tracking-wide">Naimul Islam</h4>
                    <p className="text-green-400 font-semibold text-xl mb-6">CSE-24, BUET</p>

                    <div className="bg-gray-900/80 w-full py-4 rounded-xl flex flex-col items-center border border-gray-700 mt-auto shadow-md">
                        <Code className="w-8 h-8 text-blue-400 mb-2" />
                        <span className="text-gray-300 text-center font-medium text-lg leading-snug">
                            Core Architect <br />
                            <span className="text-gray-400 text-base">System Designer</span>
                        </span>
                    </div>
                </div>

                {/* Member Card: Rakibul Hasan */}
                <div className="bg-gray-800/80 p-10 rounded-3xl border-2 border-gray-600 flex flex-col items-center w-[420px] relative shadow-lg hover:border-gray-500 transition-all transform hover:-translate-y-2">
                    <div className="absolute -top-6 bg-gradient-to-r from-gray-700 to-gray-600 text-gray-100 px-8 py-2 rounded-full font-bold text-lg flex items-center gap-2 shadow-lg border border-gray-500">
                        <User className="w-6 h-6 text-gray-300" /> Member
                    </div>

                    {/* Rakibul's Image Container */}
                    <div className="w-56 h-56 rounded-full border-4 border-gray-600/50 overflow-hidden mb-6 mt-4 bg-gray-900 flex items-center justify-center shadow-inner">
                        {/* TODO: Insert Rakibul's image path here */}
                        <img
                            src="/images/rakibul.jpg"
                            alt="Rakibul Hasan"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                e.currentTarget.src = "https://via.placeholder.com/250?text=Rakibul";
                            }}
                        />
                    </div>

                    <h4 className="text-4xl font-bold text-white mb-2 tracking-wide">Rakibul Hasan</h4>
                    <p className="text-gray-400 font-semibold text-xl mb-6">CSE-24, BUET</p>

                    <div className="bg-gray-900/80 w-full py-4 rounded-xl flex flex-col items-center border border-gray-700 mt-auto shadow-md">
                        <Microscope className="w-8 h-8 text-orange-400 mb-2" />
                        <span className="text-gray-300 text-center font-medium text-lg leading-snug">
                            Researcher <br />
                            <span className="text-gray-500 text-base">&nbsp;</span> {/* Spacing alignment */}
                        </span>
                    </div>
                </div>

            </div>
        </div>
    );
}