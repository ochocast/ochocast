import { FC } from 'react';
import { ChangeEvent, FormEvent, useState } from 'react'
import './events.css';

import Header from '../../components/Header/Header';
import Button from '../../components/buttons/button/button';
import Modal from '../../components/modal/modal';
import TextBox from '../../components/TextBox/TextBox';
import TextArea from '../../components/TextArea/TextArea';
import { Option } from '../../components/SelectBox/SelectBox';
import { SelectBox } from '../../components/SelectBox/SelectBox';

interface eventsProps {}

const categories = ['BBL', 'Conférence'];

const EventsPage: FC<eventsProps> = () => {
    const [isOpen, setisOpen] = useState(false);
    const toggle = () => { setisOpen(!isOpen);};

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [errorName, setErrorName] = useState(false)
    const [errorDescription, setErrorDescription] = useState(false)

    const [value, setValue] = useState('');

    const handleSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
        setValue(event.target.value);
    };

    const options: Option[] = [
        { label: 'Select...', value: '' },
        ...categories.map((category) => ({ label: category, value: category })),
      ];

    const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
      setName(e.target.value)
    }
    const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        setDescription(e.target.value)
    }

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!name.trim()) {
        setErrorName(true)
      }
      if (!description.trim()) {
        setErrorDescription(true)
      }
    }

    return (
    <div className="events">
        <Header/>
        <Button
            onClick={toggle}
            children = "Créer un évènement"
        />
        <Modal isOpen={isOpen} toggle={toggle}>
            <h1>Créer un nouvel évènement</h1>
            <form onSubmit={handleSubmit}>
                <div className="side-by-side">
                    <TextBox
                        type="text"
                        label="Nom de l'évènement"
                        placeholder="Mon évènement"
                        value={name}
                        name='name'
                        error={errorName}
                        onChange={handleNameChange}
                    />
                    <div className='input-wrapper'>
                        <label>Date de l'évènement</label>
                        <input type='date'  
                            name="date"
                            required
                        />
                    </div>
                    <SelectBox
                        title="Catégorie"
                        options={options}
                        value={value}
                        onChange={handleSelectChange}
                    />
                </div>
                <TextArea
                    label="Description de l'évènement"
                    placeholder="Description..."
                    value={description}
                    name='description'
                    error={errorDescription}
                    onChange={handleDescriptionChange}
                />
                <Button className="submit-button" type="submit">Créer l'évènement</Button>
            </form>
        </Modal>
    </div>
)};
export default EventsPage;
