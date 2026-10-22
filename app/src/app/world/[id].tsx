import { useLocalSearchParams } from 'expo-router';
import { Home } from '../../components/Home';
export default function WorldMap() { const { id } = useLocalSearchParams<{ id: string }>(); return <Home worldId={id} />; }
