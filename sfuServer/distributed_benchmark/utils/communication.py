"""
Module de communication entre le controller et les workers.
Gère les requêtes HTTP et WebSocket.
"""
import aiohttp
import asyncio
import time
import requests
from typing import Dict, List, Optional, Any


class WorkerClient:
    """Client pour communiquer avec un worker via HTTP"""
    
    def __init__(self, ip: str, port: int, timeout: int = 30):
        self.ip = ip
        self.port = port
        self.timeout = timeout
        self.base_url = f"http://{ip}:{port}"
        
    async def ping(self) -> bool:
        """Vérifie que le worker est accessible"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/ping",
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    return resp.status == 200
        except Exception as e:
            print(f"[WorkerClient] Ping failed for {self.ip}: {e}")
            return False
    
    async def get_time(self) -> Optional[float]:
        """Récupère le timestamp actuel du worker pour vérifier la synchro"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/time",
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get('timestamp')
        except Exception as e:
            print(f"[WorkerClient] Get time failed for {self.ip}: {e}")
        return None
    
    async def start_viewers(
        self,
        count: int,
        viewer_url: str,
        stun_url: str,
        red_threshold: float,
        start_ids: int
    ) -> Dict[str, Any]:
        """Démarre les viewers sur le worker"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/start",
                    json={
                        "count": count,
                        "viewer_url": viewer_url,
                        "stun_url": stun_url,
                        "red_threshold": red_threshold,
                        "start_ids": start_ids
                    },
                    timeout=aiohttp.ClientTimeout(total=self.timeout)
                ) as resp:
                    data = await resp.json()
                    print(f"[WorkerClient] Start viewers on {self.ip}: {data}")
                    return data
        except Exception as e:
            print(f"[WorkerClient] Start viewers failed for {self.ip}: {e}")
            return {"status": "error", "message": str(e)}
    
    async def get_status(self) -> Dict[str, Any]:
        """Récupère le statut des viewers sur le worker"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/status",
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        return await resp.json()
        except Exception as e:
            print(f"[WorkerClient] Get status failed for {self.ip}: {e}")
        return {"status": "error", "message": str(e)}
    
    async def get_metrics(self) -> Dict[str, Any]:
        """Récupère les métriques des viewers"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/metrics",
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        return await resp.json()
        except Exception as e:
            print(f"[WorkerClient] Get metrics failed for {self.ip}: {e}")
        return {"status": "error", "message": str(e)}
    
    async def get_timestamps(self, viewer_id: str) -> Optional[Dict[str, Any]]:
        """Récupère les timestamps d'un viewer spécifique"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/timestamps/{viewer_id}",
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    if resp.status == 200:
                        return await resp.json()
        except Exception as e:
            print(f"[WorkerClient] Get timestamps failed for {self.ip}/{viewer_id}: {e}")
        return None
    
    async def stop_all(self) -> Dict[str, Any]:
        """Arrête tous les viewers sur le worker"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/stop",
                    timeout=aiohttp.ClientTimeout(total=self.timeout)
                ) as resp:
                    data = await resp.json()
                    print(f"[WorkerClient] Stop all on {self.ip}: {data}")
                    return data
        except Exception as e:
            print(f"[WorkerClient] Stop all failed for {self.ip}: {e}")
            return {"status": "error", "message": str(e)}


class WorkerPool:
    """Gestion d'un pool de workers"""
    
    def __init__(self, workers_config: List[Dict[str, Any]], timeout: int = 30):
        self.clients = []
        for worker in workers_config:
            if worker.get('enabled', True):
                client = WorkerClient(
                    ip=worker['ip'],
                    port=worker.get('port', 8080),
                    timeout=timeout
                )
                self.clients.append(client)
    
    async def ping_all(self) -> Dict[str, bool]:
        """Ping tous les workers"""
        tasks = [client.ping() for client in self.clients]
        results = await asyncio.gather(*tasks)
        return {
            client.ip: result
            for client, result in zip(self.clients, results)
        }
    
    async def check_time_sync(self, max_drift: float = 1.0) -> Dict[str, float]:
        """Vérifie la synchronisation temporelle des workers"""
        local_time = time.time()
        tasks = [client.get_time() for client in self.clients]
        worker_times = await asyncio.gather(*tasks)
        
        drifts = {}
        for client, worker_time in zip(self.clients, worker_times):
            if worker_time is not None:
                drift = abs(worker_time - local_time)
                drifts[client.ip] = drift
                if drift > max_drift:
                    print(f"⚠️  [WorkerPool] Time drift for {client.ip}: {drift:.3f}s (max: {max_drift}s)")
            else:
                drifts[client.ip] = float('inf')
                print(f"❌ [WorkerPool] Could not get time from {client.ip}")
        
        return drifts
    
    async def start_all_viewers(
        self,
        distribution: Dict[str, int],
        viewer_url: str,
        stun_url: str,
        red_threshold: float
    ) -> Dict[str, Dict[str, Any]]:
        """Démarre les viewers sur tous les workers selon la distribution"""
        tasks = []
        results = {}
        
        current_id = 1
        for client in self.clients:
            count = distribution.get(client.ip, 0)
            if count > 0:
                tasks.append(
                    client.start_viewers(
                        count=count,
                        viewer_url=viewer_url,
                        stun_url=stun_url,
                        red_threshold=red_threshold,
                        start_ids=current_id
                    )
                )
                current_id += count
            else:
                tasks.append(asyncio.sleep(0))  # Placeholder
        
        responses = await asyncio.gather(*tasks)
        
        for client, response in zip(self.clients, responses):
            if isinstance(response, dict):
                results[client.ip] = response
        
        return results
    
    async def get_all_status(self) -> Dict[str, Dict[str, Any]]:
        """Récupère le statut de tous les workers"""
        tasks = [client.get_status() for client in self.clients]
        statuses = await asyncio.gather(*tasks)
        return {
            client.ip: status
            for client, status in zip(self.clients, statuses)
        }
    
    async def get_all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """Récupère les métriques de tous les workers"""
        tasks = [client.get_metrics() for client in self.clients]
        metrics = await asyncio.gather(*tasks)
        return {
            client.ip: metric
            for client, metric in zip(self.clients, metrics)
        }
    
    async def collect_all_timestamps(self, viewer_ids_by_worker: Dict[str, List[str]]) -> Dict[str, Dict[str, Any]]:
        """Collecte tous les timestamps de tous les viewers"""
        all_timestamps = {}
        
        for client in self.clients:
            viewer_ids = viewer_ids_by_worker.get(client.ip, [])
            for viewer_id in viewer_ids:
                timestamps = await client.get_timestamps(viewer_id)
                if timestamps:
                    all_timestamps[viewer_id] = timestamps
        
        return all_timestamps
    
    async def stop_all(self) -> Dict[str, Dict[str, Any]]:
        """Arrête tous les viewers sur tous les workers"""
        tasks = [client.stop_all() for client in self.clients]
        results = await asyncio.gather(*tasks)
        return {
            client.ip: result
            for client, result in zip(self.clients, results)
        }
