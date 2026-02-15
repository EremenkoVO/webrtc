import { faMicrophone, faMicrophoneSlash, FontAwesomeIcon } from '@/icons';

type Props = {
  name: string;
  showMuted: boolean;
  speaking: boolean;
};

export default function Badge({ name, showMuted, speaking }: Props) {
  return (
    <div
      className={`absolute bottom-2 left-2 flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-lg text-sm border ${
        speaking ? 'border-green-500/50' : 'border-slate-700/50'
      }`}
    >
      <span className="truncate max-w-[200px]">{name}</span>
      {showMuted && (
        <FontAwesomeIcon icon={faMicrophoneSlash} className="text-red-400" />
      )}
      {speaking && (
        <FontAwesomeIcon
          icon={faMicrophone}
          className="text-green-400 animate-pulse"
        />
      )}
    </div>
  );
}
