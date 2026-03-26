import asyncio
import twscrape

async def setup():
    api = twscrape.API()
    await api.pool.add_account(
        username='zervalsz',
        password='wZtm17092026',
        email='wenfanzhang26@gmail.com',
        email_password='Zwfabc-02266721'
    )
    print('Account added')
    await api.pool.login_all()
    print('Login done')

asyncio.run(setup())