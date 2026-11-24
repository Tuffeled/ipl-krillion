import Game from './Game';
import { aliases, names, questions } from '../lib/data';

export default function Page() { return <Game pool={questions} names={names} aliases={aliases} />; }
